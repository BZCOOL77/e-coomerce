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
        const response = await fetch('http://localhost:3000/api/auth/inscrire', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(userData)
        });

        const data = await response.json();

        if (response.ok) {
            // Succès !
            alert("Compte créé avec succès ! Bienvenue chez shopycloth.");
            // On redirige vers la page de connexion
            window.location.href = 'connexion.html';
        } else {
            // Le serveur a renvoyé une erreur (ex: email déjà utilisé)
            alert("Erreur lors de l'inscription : " + (data.error || data.message));
        }

    } catch (error) {
        console.error("Erreur réseau :", error);
        alert("Impossible de contacter le serveur. Vérifie s'il est bien lancé !");
    }
});