<!DOCTYPE html>
<html lang="ka">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Avatar G - AI Media Factory</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;700;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            -webkit-tap-highlight-color: transparent;
        }

        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            background: #05070A;
            color: #E8E8E8;
            overflow-x: hidden;
            position: relative;
            min-height: 100vh;
        }

        /* Animated Background */
        .bg-particles {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 0;
            pointer-events: none;
        }

        .particle {
            position: absolute;
            width: 2px;
            height: 2px;
            background: rgba(192, 192, 192, 0.3);
            border-radius: 50%;
            animation: float 20s infinite ease-in-out;
        }

        @keyframes float {
            0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.3; }
            50% { transform: translate(50px, -100px) scale(1.5); opacity: 0.6; }
        }

        /* Container */
        .app-container {
            position: relative;
            z-index: 1;
            max-width: 480px;
            margin: 0 auto;
            min-height: 100vh;
            padding-bottom: 40px;
        }

        /* Top Bar */
        .top-bar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 16px 20px;
            background: rgba(255, 255, 255, 0.04);
            backdrop-filter: blur(20px);
            border-bottom: 1px solid rgba(192, 192, 192, 0.1);
            position: sticky;
            top: 0;
            z-index: 100;
        }

        .back-arrow {
            font-size: 20px;
            color: rgba(255, 255, 255, 0.6);
        }

        .app-title {
            font-family: 'Orbitron', monospace;
            font-weight: 700;
            font-size: 16px;
            letter-spacing: 2px;
            background: linear-gradient(135deg, #C0C0C0 0%, #E8E8E8 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .status-indicator {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 11px;
            color: rgba(255, 255, 255, 0.5);
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .status-dot {
            width: 8px;
            height: 8px;
            background: #00FF88;
            border-radius: 50%;
            animation: pulse 2s infinite;
            box-shadow: 0 0 10px rgba(0, 255, 136, 0.5);
        }

        @keyframes pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.6; transform: scale(1.2); }
        }

        /* Hero Section */
        .hero {
            padding: 60px 20px 40px;
            text-align: center;
        }

        .hero h1 {
            font-family: 'Orbitron', monospace;
            font-size: 48px;
            font-weight: 900;
            letter-spacing: 4px;
            margin-bottom: 12px;
            background: linear-gradient(135deg, #FFFFFF 0%, #C0C0C0 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .hero-subtitle {
            font-size: 15px;
            color: rgba(255, 255, 255, 0.6);
            font-weight: 500;
            margin-bottom: 24px;
            letter-spacing: 0.5px;
        }

        .hero-pipeline {
            font-size: 13px;
            color: rgba(255, 255, 255, 0.4);
            line-height: 1.8;
            margin-bottom: 32px;
            font-weight: 300;
        }

        .cta-primary {
            display: inline-block;
            padding: 16px 40px;
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid rgba(192, 192, 192, 0.2);
            border-radius: 12px;
            color: #FFFFFF;
            font-weight: 600;
            font-size: 15px;
            text-decoration: none;
            backdrop-filter: blur(20px);
            box-shadow: 0 0 20px rgba(192, 192, 192, 0.1);
            transition: all 0.3s ease;
        }

        .cta-primary:active {
            transform: scale(0.98);
            box-shadow: 0 0 30px rgba(192, 192, 192, 0.3);
        }

        /* Pipeline Flow */
        .pipeline {
            padding: 40px 20px;
            background: rgba(255, 255, 255, 0.02);
            border-top: 1px solid rgba(192, 192, 192, 0.08);
            border-bottom: 1px solid rgba(192, 192, 192, 0.08);
        }

        .pipeline-title {
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 2px;
            color: rgba(255, 255, 255, 0.4);
            margin-bottom: 24px;
            text-align: center;
        }

        .pipeline-step {
            display: flex;
            align-items: center;
            gap: 16px;
            padding: 12px 0;
            position: relative;
        }

        .pipeline-step:not(:last-child)::after {
            content: '↓';
            position: absolute;
            left: 19px;
            bottom: -8px;
            color: rgba(192, 192, 192, 0.2);
            font-size: 16px;
        }

        .pipeline-icon {
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid rgba(192, 192, 192, 0.15);
            border-radius: 10px;
            font-size: 18px;
        }

        .pipeline-text {
            flex: 1;
        }

        .pipeline-label {
            font-size: 15px;
            font-weight: 600;
            color: #FFFFFF;
            margin-bottom: 2px;
        }

        .pipeline-desc {
            font-size: 12px;
            color: rgba(255, 255, 255, 0.4);
        }

        /* Main Feature Card */
        .feature-hero {
            margin: 40px 20px;
            padding: 28px;
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid rgba(192, 192, 192, 0.15);
            border-radius: 20px;
            backdrop-filter: blur(20px);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }

        .feature-hero-icon {
            font-size: 32px;
            margin-bottom: 16px;
        }

        .feature-hero-title {
            font-size: 22px;
            font-weight: 700;
            margin-bottom: 8px;
            font-family: 'Orbitron', monospace;
            letter-spacing: 1px;
        }

        .feature-hero-subtitle {
            font-size: 13px;
            color: rgba(255, 255, 255, 0.5);
            margin-bottom: 20px;
        }

        .feature-list {
            list-style: none;
            margin-bottom: 24px;
        }

        .feature-list li {
            font-size: 13px;
            color: rgba(255, 255, 255, 0.7);
            padding: 8px 0;
            padding-left: 20px;
            position: relative;
        }

        .feature-list li::before {
            content: '•';
            position: absolute;
            left: 0;
            color: rgba(192, 192, 192, 0.5);
        }

        /* Services Grid */
        .services {
            padding: 20px;
        }

        .services-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
        }

        .service-card {
            padding: 24px 16px;
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid rgba(192, 192, 192, 0.1);
            border-radius: 16px;
            text-align: center;
            backdrop-filter: blur(20px);
            transition: all 0.3s ease;
        }

        .service-card:active {
            transform: scale(0.98);
            border-color: rgba(192, 192, 192, 0.3);
            box-shadow: 0 0 20px rgba(192, 192, 192, 0.1);
        }

        .service-icon {
            font-size: 28px;
            margin-bottom: 12px;
        }

        .service-name {
            font-size: 13px;
            font-weight: 600;
            color: #FFFFFF;
            margin-bottom: 4px;
        }

        .service-desc {
            font-size: 11px;
            color: rgba(255, 255, 255, 0.4);
        }

        /* Status Panel */
        .status-panel {
            margin: 40px 20px;
            padding: 20px;
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid rgba(192, 192, 192, 0.1);
            border-radius: 16px;
            backdrop-filter: blur(20px);
        }

        .status-panel-title {
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 2px;
            color: rgba(255, 255, 255, 0.4);
            margin-bottom: 16px;
        }

        .status-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 0;
            font-size: 13px;
        }

        .status-label {
            color: rgba(255, 255, 255, 0.6);
        }

        .status-value {
            color: #FFFFFF;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .status-online {
            width: 6px;
            height: 6px;
            background: #00FF88;
            border-radius: 50%;
        }

        /* Final CTA */
        .final-cta {
            padding: 60px 20px 40px;
            text-align: center;
        }

        .final-cta h2 {
            font-size: 24px;
            font-weight: 700;
            margin-bottom: 12px;
            font-family: 'Orbitron', monospace;
        }

        .final-cta p {
            font-size: 14px;
            color: rgba(255, 255, 255, 0.5);
            margin-bottom: 28px;
            line-height: 1.6;
        }

        .cta-button {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 18px 48px;
            background: rgba(255, 255, 255, 0.08);
            border: 1px solid rgba(192, 192, 192, 0.25);
            border-radius: 14px;
            color: #FFFFFF;
            font-weight: 700;
            font-size: 16px;
            text-decoration: none;
            backdrop-filter: blur(20px);
            box-shadow: 0 8px 32px rgba(192, 192, 192, 0.15);
            transition: all 0.3s ease;
        }

        .cta-button:active {
            transform: scale(0.98);
            box-shadow: 0 12px 40px rgba(192, 192, 192, 0.3);
        }
    </style>
</head>
<body>
    <!-- Animated Background -->
    <div class="bg-particles" id="particles"></div>

    <!-- App Container -->
    <div class="app-container">
        <!-- Top Bar -->
        <div class="top-bar">
            <div class="back-arrow">←</div>
            <div class="app-title">AVATAR G</div>
            <div class="status-indicator">
                <span class="status-dot"></span>
                <span>ACTIVE</span>
            </div>
        </div>

        <!-- Hero Section -->
        <section class="hero">
            <h1>AVATAR G</h1>
            <div class="hero-subtitle">Your AI Media Factory</div>
            <div class="hero-pipeline">
                Text → Voice → Music → Video → Avatar<br>
                → Final Cinematic Output
            </div>
            <a href="#" class="cta-primary">Start Creating</a>
        </section>

        <!-- Pipeline Flow -->
        <section class="pipeline">
            <div class="pipeline-title">Pipeline Architecture</div>
            <div class="pipeline-step">
                <div class="pipeline-icon">📝</div>
                <div class="pipeline-text">
                    <div class="pipeline-label">Script</div>
                    <div class="pipeline-desc">Geo / EN / RU</div>
                </div>
            </div>
            <div class="pipeline-step">
                <div class="pipeline-icon">🎙</div>
                <div class="pipeline-text">
                    <div class="pipeline-label">AI Voice</div>
                    <div class="pipeline-desc">Neural synthesis</div>
                </div>
            </div>
            <div class="pipeline-step">
                <div class="pipeline-icon">🎞</div>
                <div class="pipeline-text">
                    <div class="pipeline-label">AI Video Scenes</div>
                    <div class="pipeline-desc">Multi-clip generation</div>
                </div>
            </div>
            <div class="pipeline-step">
                <div class="pipeline-icon">⚙</div>
                <div class="pipeline-text">
                    <div class="pipeline-label">Cine-Lab Render Engine</div>
                    <div class="pipeline-desc">FFmpeg processing</div>
                </div>
            </div>
            <div class="pipeline-step">
                <div class="pipeline-icon">✅</div>
                <div class="pipeline-text">
                    <div class="pipeline-label">Final MP4</div>
                    <div class="pipeline-desc">1080x1920 vertical</div>
                </div>
            </div>
        </section>

        <!-- Main Feature Card -->
        <section class="feature-hero">
            <div class="feature-hero-icon">🎬</div>
            <h2 class="feature-hero-title">Video Cine-Lab</h2>
            <div class="feature-hero-subtitle">Georgian AI Video Rendering</div>
            <ul class="feature-list">
                <li>Vertical 1080x1920 format</li>
                <li>Georgian subtitles (burned-in)</li>
                <li>AI voice + video mixing</li>
                <li>Production-quality MP4</li>
            </ul>
            <a href="#" class="cta-primary" style="width: 100%; text-align: center;">Generate Video</a>
        </section>

        <!-- Services Grid -->
        <section class="services">
            <div class="services-grid">
                <div class="service-card">
                    <div class="service-icon">🧠</div>
                    <div class="service-name">Script AI</div>
                    <div class="service-desc">Story generation</div>
                </div>
                <div class="service-card">
                    <div class="service-icon">🎙</div>
                    <div class="service-name">Voice Lab</div>
                    <div class="service-desc">Neural synthesis</div>
                </div>
                <div class="service-card">
                    <div class="service-icon">🎵</div>
                    <div class="service-name">Music Studio</div>
                    <div class="service-desc">AI composition</div>
                </div>
                <div class="service-card">
                    <div class="service-icon">🎞</div>
                    <div class="service-name">Cine-Lab</div>
                    <div class="service-desc">Video rendering</div>
                </div>
                <div class="service-card">
                    <div class="service-icon">🧍</div>
                    <div class="service-name">Avatar Maker</div>
                    <div class="service-desc">3D characters</div>
                </div>
                <div class="service-card">
                    <div class="service-icon">🏢</div>
                    <div class="service-name">Business Suite</div>
                    <div class="service-desc">Enterprise tools</div>
                </div>
            </div>
        </section>

        <!-- Status Panel -->
        <section class="status-panel">
            <div class="status-panel-title">System Status</div>
            <div class="status-row">
                <div class="status-label">Render Worker</div>
                <div class="status-value">
                    <span class="status-online"></span>
                    Online
                </div>
            </div>
            <div class="status-row">
                <div class="status-label">Queue</div>
                <div class="status-value">Processing</div>
            </div>
            <div class="status-row">
                <div class="status-label">Avg Render Time</div>
                <div class="status-value">18 sec</div>
            </div>
            <div class="status-row">
                <div class="status-label">Region</div>
                <div class="status-value">Amsterdam (Fly.io)</div>
            </div>
        </section>

        <!-- Final CTA -->
        <section class="final-cta">
            <h2>Create Your First AI Video</h2>
            <p>From text to cinematic output<br>in under 30 seconds</p>
            <a href="#" class="cta-button">
                <span>🚀</span>
                <span>Start Now</span>
            </a>
        </section>
    </div>

    <script>
        // Generate animated particles
        const particlesContainer = document.getElementById('particles');
        const particleCount = 50;

        for (let i = 0; i < particleCount; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle';
            particle.style.left = Math.random() * 100 + '%';
            particle.style.top = Math.random() * 100 + '%';
            particle.style.animationDelay = Math.random() * 20 + 's';
            particle.style.animationDuration = (15 + Math.random() * 10) + 's';
            particlesContainer.appendChild(particle);
        }
    </script>
</body>
</html>
