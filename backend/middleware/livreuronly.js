// Middleware pour restreindre l'accès aux routes réservées aux livreurs
// Vérifie que l'utilisateur authentifié possède le rôle 'livreur' (ou 'admin').
// Usage: router.get('/route', auth, livreurOnly, controller.method)

module.exports = (req, res, next) => {
    try {
        // S'assurer que l'objet d'authentification existe (fourni par `auth`)
        if (!req.auth || !req.auth.role) {
            return res.status(401).json({ error: 'Requête non authentifiée.' });
        }

        const role = (req.auth.role || '').toString().toLowerCase();

        // Autoriser si l'utilisateur est livreur ou admin
        if (role === 'livreur' || role === 'admin') {
            return next();
        }

        // Sinon refuser l'accès
        return res.status(403).json({ error: 'Accès interdit : réservé aux livreurs.' });
    } catch (error) {
        console.error('Erreur dans le middleware livreuronly :', error);
        return res.status(500).json({ error: 'Erreur serveur dans le middleware d\'autorisation.' });
    }
};
