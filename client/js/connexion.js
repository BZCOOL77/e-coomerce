document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/api/auth/seconnecter`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (response.ok) {
            // --- ÉTAPE CRUCIALE ---
            // On stocke le userId et le token dans le localStorage
            localStorage.setItem('userId', data.userId);
            localStorage.setItem('token', data.token);
            localStorage.setItem('role', data.role); // C'est ça qui permet de s'en souvenir au prochain refresh

            alert("Connexion réussie ! Ravie de vous revoir.");
            
            // Redirection vers l'accueil ou le catalogue
            window.location.href = 'client.html'; 
        } else {
            // Affiche l'erreur du backend (ex: "Mot de passe incorrect")
            alert(data.error || "Erreur lors de la connexion");
        }

    } catch (error) {
        console.error("Erreur réseau :", error);
        alert("Le serveur ne répond pas. Vérifie ton terminal !");
    }
});