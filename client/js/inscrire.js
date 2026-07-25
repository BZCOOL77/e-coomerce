document.getElementById('signup-form').addEventListener('submit', async (e) => {
    e.preventDefault(); // Empêche la page de se recharger

    // 1. On récupère les valeurs des champs
    const nom = document.getElementById('nom').value;
    const prenom = document.getElementById('prenom').value;
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const role = document.querySelector('input[name="role"]:checked').value;

    const userData = {
        nom: nom,
        prenom: prenom,
        email: email,
        password: password,
        role: role
    };

    try {
        // 2. On envoie les données au serveur
        const response = await fetch(`${CONFIG.API_BASE_URL}/api/auth/inscrire`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(userData)
        });

        const data = await response.json();

        if (response.ok) {
            // --- ÉTAPE CRUCIALE ---
            // On stocke le userId et le token dans le localStorage
            localStorage.setItem('userId', data.userId);
            localStorage.setItem('token', data.token);
            localStorage.setItem('role', data.role); // C'est ça qui permet de s'en souvenir au prochain refresh

            // Succès !
            alert("Compte créé avec succès ! Bienvenue chez shopycloth.");
            // On redirige vers la page de la boutique
            window.location.href = 'client.html';
        } else {
            // Le serveur a renvoyé une erreur (ex: email déjà utilisé)
            alert("Erreur lors de l'inscription : " + (data.error || data.message));
        }

    } catch (error) {
        console.error("Erreur réseau :", error);
        alert("Impossible de contacter le serveur. Vérifie s'il est bien lancé !");
    }
});