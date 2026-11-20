// Routes de l'autorisation OAuth pour Claude (étape A de docs/mcp-cadrage.md).
// Montées SEULEMENT si LISTO_MCP=on ; sinon, toutes ces adresses répondent
// comme une adresse inexistante (404).
//
// Sans session (appelées par Claude ou par le navigateur) :
//   GET  /.well-known/oauth-protected-resource/mcp   description de la ressource (RFC 9728)
//   GET  /.well-known/oauth-protected-resource       idem (adresse de repli)
//   GET  /.well-known/oauth-authorization-server     description du serveur d'autorisation (RFC 8414)
//   GET  /oauth/authorize    vérifie la demande, puis ouvre l'écran « Autoriser Claude »
//   POST /oauth/token        échange du code, renouvellement (formulaire)
//   POST /oauth/revoke       révocation par l'application (RFC 7009)
//   POST /oauth/register     enregistrement automatique (DCR, RFC 7591)
// Aucune de ces routes ne lit le cookie de session : un navigateur connecté
// n'y obtient rien de plus.
//
// Avec la session (écrans « Autoriser Claude » et « Connexions Claude »,
// même origine exigée) :
//   GET    /api/oauth/demandes/:id         ce qu'il faut afficher
//   POST   /api/oauth/demandes/:id/accord  accord (mot de passe, et code 2FA)
//   POST   /api/oauth/demandes/:id/refus   refus
//   GET    /api/me/claude                  mes connexions Claude actives
//   DELETE /api/me/claude/:id              déconnecter une connexion
//   DELETE /api/me/claude                  tout déconnecter

import fs from 'node:fs';
import express from 'express';
import { verifyPassword, PASSWORD_MAX } from '../passwords.js';
import { attemptKeys } from '../auth.js';
import { checkSecondFactor } from '../twofactor.js';
import { OAuthError, SCOPES, PKCE_CHALLENGE, parseScope, withParams, REQUEST_ID } from '../oauth.js';

const PAGES = new URL('../pages/', import.meta.url);
// Noms des messages de l'écran « Autoriser Claude »
// (public/js/i18n/fr/autorisation.js), traduits par req.t
const BLOCKED = 'autorisation.tropDeTentatives';
const EXPIRED = 'autorisation.demandeExpiree';
const MAX_STATE = 500;
const MAX_LISTS = 200;

// Une seule valeur texte (un paramètre répété ou absent donne undefined)
const one = (value) => (typeof value === 'string' ? value : undefined);

// Réponse d'erreur OAuth (JSON), jamais mise en cache
function sendError(res, error) {
  res.status(error.status ?? 400).json({ error: error.error ?? 'invalid_request', error_description: error.message });
}

// Page « Demande d'autorisation invalide », avec le sprite d'icônes
function invalidPage(publicDir) {
  const index = fs.readFileSync(`${publicDir}/index.html`, 'utf8');
  const sprite = index.slice(index.indexOf('<svg class="sprite"'), index.indexOf('</defs></svg>') + '</defs></svg>'.length);
  return Buffer.from(fs.readFileSync(new URL('autorisation-invalide.html', PAGES), 'utf8').replace('<!-- sprite -->', sprite));
}

// --- Routes sans session ---
export function oauthRoutes(ctx, { publicDir }) {
  const router = express.Router();
  const { oauth } = ctx;
  const invalid = invalidPage(publicDir);
  const noStore = (req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', Pragma: 'no-cache' });
    next();
  };

  // Description de la ressource protégée (/mcp) : qui délivre les jetons
  const resourceMetadata = (req, res) => {
    res.set('Cache-Control', 'max-age=300');
    res.json({
      resource: oauth.resource,
      authorization_servers: [oauth.issuer],
      scopes_supported: SCOPES,
      bearer_methods_supported: ['header'],
      resource_name: 'Listo',
    });
  };
  router.get('/.well-known/oauth-protected-resource/mcp', resourceMetadata);
  router.get('/.well-known/oauth-protected-resource', resourceMetadata);

  // Description du serveur d'autorisation
  router.get('/.well-known/oauth-authorization-server', (req, res) => {
    res.set('Cache-Control', 'max-age=300');
    res.json({
      issuer: oauth.issuer,
      authorization_endpoint: `${oauth.issuer}/oauth/authorize`,
      token_endpoint: `${oauth.issuer}/oauth/token`,
      revocation_endpoint: `${oauth.issuer}/oauth/revoke`,
      registration_endpoint: `${oauth.issuer}/oauth/register`,
      scopes_supported: SCOPES,
      response_types_supported: ['code'],
      response_modes_supported: ['query'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      revocation_endpoint_auth_methods_supported: ['none'],
      client_id_metadata_document_supported: true,
      authorization_response_iss_parameter_supported: true,
    });
  });

  // Début d'une autorisation, dans le navigateur de la personne.
  // 1. Application et adresse de retour : si elles ne sont pas sûres, page
  //    d'erreur, et AUCUNE redirection (sinon Listo servirait de relais).
  // 2. Le reste : erreur renvoyée à l'application (avec state et iss).
  // 3. Demande gardée 10 minutes, puis écran « Autoriser Claude ».
  router.get('/oauth/authorize', noStore, async (req, res, next) => {
    try {
      const params = req.query;
      const redirectUri = one(params.redirect_uri);
      const client = await oauth.resolveClient(one(params.client_id));
      if (!client || !redirectUri || !oauth.clientRedirect(client, redirectUri)) {
        return res.status(400).type('html').send(invalid);
      }
      const state = one(params.state);
      const back = (error, description) => res.redirect(302, withParams(redirectUri, {
        error, error_description: description, state: state && state.length <= MAX_STATE ? state : undefined, iss: oauth.issuer,
      }));
      if (params.state !== undefined && (state === undefined || state.length > MAX_STATE)) return back('invalid_request', 'Paramètre state invalide.');
      if (one(params.response_type) !== 'code') return back('unsupported_response_type', 'Seul response_type=code est accepté.');
      if (one(params.code_challenge_method) !== 'S256' || !PKCE_CHALLENGE.test(one(params.code_challenge) ?? '')) {
        return back('invalid_request', 'PKCE obligatoire : code_challenge avec code_challenge_method=S256.');
      }
      if (params.resource !== undefined && one(params.resource) !== oauth.resource) return back('invalid_target', `Ressource inconnue : seule ${oauth.resource} est servie.`);
      const scope = params.scope === undefined || typeof params.scope === 'string' ? parseScope(params.scope) : null;
      if (!scope) return back('invalid_scope', `Portées connues : ${SCOPES.join(' ')}.`);
      const id = oauth.createRequest({ client, redirectUri, state, codeChallenge: params.code_challenge, scope });
      return res.redirect(303, `/#/autoriser/${id}`);
    } catch (error) {
      return next(error);
    }
  });

  // Échange de jetons : formulaire (application/x-www-form-urlencoded)
  // seulement, 10 ko au plus. Un paramètre répété est refusé.
  const form = express.urlencoded({ extended: false, limit: '10kb' });
  router.post('/oauth/token', noStore, form, (req, res) => {
    const body = req.body ?? {};
    const params = {};
    for (const [name, value] of Object.entries(body)) {
      if (typeof value !== 'string') return sendError(res, new OAuthError(400, 'invalid_request', `Paramètre répété : ${name}.`));
      params[name] = value;
    }
    try {
      if (params.grant_type === 'authorization_code') return res.json(oauth.exchangeCode(params));
      if (params.grant_type === 'refresh_token') return res.json(oauth.refresh(params));
      if (params.grant_type === undefined) throw new OAuthError(400, 'invalid_request', 'grant_type manquant (formulaire application/x-www-form-urlencoded attendu).');
      throw new OAuthError(400, 'unsupported_grant_type', 'grant_type : authorization_code ou refresh_token.');
    } catch (error) {
      if (!(error instanceof OAuthError)) throw error;
      return sendError(res, error);
    }
  });

  // Révocation demandée par l'application : toujours 200 (RFC 7009, §2.2)
  router.post('/oauth/revoke', noStore, form, (req, res) => {
    const body = req.body ?? {};
    oauth.revokeToken(one(body.token), one(body.client_id));
    res.status(200).end();
  });

  // Enregistrement automatique (DCR), corps JSON de 10 ko au plus
  router.post('/oauth/register', noStore, express.json({ limit: '10kb' }), (req, res) => {
    try {
      res.status(201).json(oauth.register(req.body, req.ip));
    } catch (error) {
      if (!(error instanceof OAuthError)) throw error;
      sendError(res, error);
    }
  });

  // Corps illisible (JSON mal formé, trop gros) : erreur OAuth, sans détail
  router.use((err, req, res, next) => {
    if (!req.path.startsWith('/oauth/')) return next(err);
    if (err.type === 'entity.too.large') return sendError(res, new OAuthError(413, 'invalid_request', 'Requête trop volumineuse.'));
    if (err.status >= 400 && err.status < 500) return sendError(res, new OAuthError(400, req.path === '/oauth/register' ? 'invalid_client_metadata' : 'invalid_request', 'Requête mal formée.'));
    return next(err);
  });

  return router;
}

// Message d'une erreur de l'accord (oauth.approve) pour l'écran : son texte
// dans la langue de la requête s'il porte un nom, sinon son explication
const consentError = (req, error) => (error.key ? req.t(error.key, error.params) : error.message);

// --- Écran « Autoriser Claude » (session exigée, montée dans /api) ---
export function oauthConsentRoutes(ctx) {
  const router = express.Router();
  const { oauth, limiter, audit } = ctx;

  const findRequest = (req, res) => {
    const request = REQUEST_ID.test(req.params.id) ? oauth.findRequest(req.params.id) : null;
    if (!request) res.status(404).json({ error: req.t(EXPIRED) });
    return request;
  };

  // Ce qu'il faut afficher : application, adresse de retour, portées
  // possibles, compte connecté, ses listes (identifiant, nom, icône et type)
  router.get('/oauth/demandes/:id', (req, res) => {
    const request = findRequest(req, res);
    if (!request) return;
    const lists = ctx.lists.myLists(req.user).map((list) => ({
      id: list.id, name: list.name, icon: list.icon, type: list.type,
    }));
    res.json({
      request: oauth.describeRequest(request),
      account: { username: req.user.username, displayName: req.user.display_name },
      twoFactor: req.user.totp_enabled === 1,
      // Session ouverte avec le fournisseur d'identité : confirmation par le fournisseur d'identité (pas de mot
      // de passe Listo), et déjà faite ou non pour cette demande
      confirmWith: req.sessionMethod === 'oidc' && ctx.oidc ? 'authelia' : 'password',
      confirmed: req.sessionMethod === 'oidc' && ctx.oidc ? ctx.oidc.confirmed(request.id, req.user.id) : false,
      lists,
    });
  });

  // Accord : portée, listes, puis mot de passe (et code 2FA) redemandés
  router.post('/oauth/demandes/:id/accord', async (req, res) => {
    const request = findRequest(req, res);
    if (!request) return;
    const { password, code, scope, lists } = req.body ?? {};
    const user = req.user;
    const described = oauth.describeRequest(request);

    if (scope !== 'read' && scope !== 'write') return res.status(400).json({ error: req.t('autorisation.choisirNiveau') });
    if (scope === 'write' && !described.write) return res.status(400).json({ error: req.t('autorisation.lectureSeulementDemandee') });
    const allLists = lists === 'all';
    let listIds = [];
    if (!allLists) {
      if (!Array.isArray(lists) || !lists.length || lists.length > MAX_LISTS || !lists.every((id) => typeof id === 'string')) {
        return res.status(400).json({ error: req.t('autorisation.choisirListe') });
      }
      const mine = new Set(ctx.lists.myLists(user).map((list) => list.id));
      listIds = [...new Set(lists)];
      if (!listIds.every((id) => mine.has(id))) return res.status(400).json({ error: req.t('autorisation.listeIntrouvable') });
    }
    // Session ouverte avec le fournisseur d'identité : la confirmation vient du fournisseur d'identité
    // (reconnexion redemandée, voir oidc.js), à la place du mot de passe et
    // du code ; elle ne sert qu'une fois
    if (req.sessionMethod === 'oidc') {
      if (!ctx.oidc?.confirmed(request.id, user.id, { consume: true })) {
        return res.status(403).json({ error: req.t('autorisation.confirmerAvecFournisseur', { provider: ctx.config.oidcName }) });
      }
      const fresh = oauth.findRequest(request.id);
      if (!fresh) return res.status(404).json({ error: req.t(EXPIRED) });
      try {
        return res.json({ redirect: oauth.approve(fresh, user, { scope, allLists, listIds }, req.ip) });
      } catch (error) {
        if (!(error instanceof OAuthError)) throw error;
        return res.status(error.status).json({ error: consentError(req, error) });
      }
    }
    if (typeof password !== 'string' || !password || password.length > PASSWORD_MAX) {
      return res.status(400).json({ error: req.t('autorisation.saisirMotDePasse') });
    }
    if (user.totp_enabled === 1 && (typeof code !== 'string' || !code.trim())) {
      return res.status(400).json({ error: req.t('autorisation.saisirCode') });
    }

    // Même limitation des tentatives que la connexion (5 échecs en 15 min)
    const keys = attemptKeys(req, user.username);
    if (limiter.isBlocked(keys)) {
      audit('connexion_bloquee', { utilisateur: user.username, ip: req.ip, etape: 'autorisation claude' });
      return res.status(429).json({ error: req.t(BLOCKED) });
    }
    limiter.fail(keys); // compté d'avance, remis à zéro en cas de succès
    if (!(await verifyPassword(password, user.password_hash))) {
      audit('mot_de_passe_refuse', { utilisateur: user.username, ip: req.ip, etape: 'autorisation claude' });
      return res.status(403).json({ error: req.t('autorisation.motDePasseIncorrect') });
    }
    if (user.totp_enabled === 1 && !checkSecondFactor(ctx, user, code)) {
      audit('connexion_echouee', { utilisateur: user.username, ip: req.ip, etape: 'autorisation claude, 2fa' });
      return res.status(403).json({ error: req.t('autorisation.codeIncorrect') });
    }
    limiter.reset(keys);

    // La demande a pu expirer pendant la vérification du mot de passe
    const still = oauth.findRequest(request.id);
    if (!still) return res.status(404).json({ error: req.t(EXPIRED) });
    try {
      res.json({ redirect: oauth.approve(still, user, { scope, allLists, listIds }, req.ip) });
    } catch (error) {
      if (!(error instanceof OAuthError)) throw error;
      res.status(error.status).json({ error: consentError(req, error) });
    }
  });

  // Refus : retour vers l'application avec error=access_denied
  router.post('/oauth/demandes/:id/refus', (req, res) => {
    const request = findRequest(req, res);
    if (!request) return;
    res.json({ redirect: oauth.refuse(request, req.user, req.ip) });
  });

  // --- Écran « Connexions Claude » : mes connexions, et les déconnecter ---
  // Aucun mot de passe demandé : déconnecter est une mesure de sécurité,
  // toujours permise. Une connexion d'un autre compte répond comme une
  // connexion inconnue (404).
  router.get('/me/claude', (req, res) => {
    res.json({ url: oauth.resource, connections: oauth.listGrants(req.user) });
  });

  router.delete('/me/claude/:id', (req, res) => {
    const id = /^\d{1,15}$/.test(req.params.id) ? Number(req.params.id) : null;
    if (id === null || !oauth.revokeOwnGrant(req.user, id)) return res.status(404).json({ error: req.t('autorisation.connexionIntrouvable') });
    return res.json({ ok: true });
  });

  router.delete('/me/claude', (req, res) => {
    res.json({ count: oauth.revokeAllOwn(req.user) });
  });

  return router;
}
