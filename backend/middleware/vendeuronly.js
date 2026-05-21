module.exports = (req, res, next) => {
    // On vérifie d'abord si req.auth existe (au cas où on aurait oublié le middleware auth avant)
    if (!req.auth) {
        return res.status(500).json({ error: "Erreur interne : Authentification manquante" });
    }
    // On vérifie ce que le middleware 'auth' a noté dans req.auth
    if (req.auth && req.auth.role === 'vendeur') {
        next(); // C'est un vendeur, on passe à la suite !
    } else {
        // C'est un client ou quelqu'un de non identifié -> STOP
        res.status(403).json({ error: 'Accès interdit : Droits de vendeur requis !' });
    }
};