// ============================
// CONFIGURATION
// ============================
// Cache GitHub API results for 1 hour to avoid rate limiting (60 req/hr unauthenticated)
const GITHUB_CACHE_KEY = 'portfolio_github_cache';
const GITHUB_CACHE_DURATION = 60 * 60 * 1000; // 1 hour in ms

// ============================
// STATE
// ============================
let allProjects = [];
let githubUsername = 'KemasMhd';


// ============================
// DATA LOADING
// ============================

/**
 * Load projects from local projects.json file
 */
async function loadLocalProjects() {
    try {
        const res = await fetch('projects.json');
        if (!res.ok) throw new Error('Failed to load projects.json');
        const data = await res.json();
        githubUsername = data.githubUsername || githubUsername;
        return data.projects || [];
    } catch (err) {
        console.warn('⚠️ Could not load projects.json:', err.message);
        return [];
    }
}

/**
 * Fetch public repos from GitHub API that have the "portfolio" topic.
 * Results are cached in localStorage for GITHUB_CACHE_DURATION.
 */
async function fetchGitHubProjects() {
    // Check cache first
    try {
        const cached = localStorage.getItem(GITHUB_CACHE_KEY);
        if (cached) {
            const { data, timestamp } = JSON.parse(cached);
            if (Date.now() - timestamp < GITHUB_CACHE_DURATION) {
                console.log('📦 Using cached GitHub data');
                return data;
            }
        }
    } catch (e) {
        // Cache read failed, continue to fetch
    }

    try {
        const res = await fetch(
            `https://api.github.com/users/${githubUsername}/repos?per_page=100&sort=updated`,
            { headers: { 'Accept': 'application/vnd.github.mercy-preview+json' } }
        );

        if (!res.ok) {
            if (res.status === 403) console.warn('⚠️ GitHub API rate limit reached. Using cached/local data.');
            throw new Error(`GitHub API error: ${res.status}`);
        }

        const repos = await res.json();

        // Filter repos that have the "portfolio" topic
        const portfolioRepos = repos
            .filter(repo => repo.topics && repo.topics.includes('portfolio'))
            .map(repo => mapGitHubRepoToProject(repo));

        // Save to cache
        try {
            localStorage.setItem(GITHUB_CACHE_KEY, JSON.stringify({
                data: portfolioRepos,
                timestamp: Date.now()
            }));
        } catch (e) {
            // localStorage might be full, ignore
        }

        console.log(`🐙 Fetched ${portfolioRepos.length} portfolio repos from GitHub`);
        return portfolioRepos;
    } catch (err) {
        console.warn('⚠️ Could not fetch GitHub repos:', err.message);
        return [];
    }
}

/**
 * Map a GitHub API repo object to our project card format
 */
function mapGitHubRepoToProject(repo) {
    // Convert topic names to categories for filtering
    const topicToCategoryMap = {
        'python': 'python',
        'tableau': 'tableau',
        'machine-learning': 'ml',
        'ml': 'ml',
        'deep-learning': 'ml',
        'data-science': 'python',
        'sql': 'python',
        'nlp': 'ml',
    };

    const categories = [];
    const tags = [];

    (repo.topics || []).forEach(topic => {
        if (topic === 'portfolio') return; // skip the marker topic
        // Add to tags (formatted nicely)
        tags.push(formatTopicAsTag(topic));
        // Map to category if applicable
        if (topicToCategoryMap[topic] && !categories.includes(topicToCategoryMap[topic])) {
            categories.push(topicToCategoryMap[topic]);
        }
    });

    // Add language as tag if present
    if (repo.language && !tags.includes(repo.language)) {
        tags.unshift(repo.language);
        const langCategory = topicToCategoryMap[repo.language.toLowerCase()];
        if (langCategory && !categories.includes(langCategory)) {
            categories.push(langCategory);
        }
    }

    return {
        title: formatRepoName(repo.name),
        description: repo.description || 'No description available.',
        image: '', // GitHub repos won't have local images, placeholder will be used
        github: repo.html_url,
        tableau: repo.homepage || '', // Use homepage field for Tableau/demo link
        tags: tags.length > 0 ? tags : ['Data Science'],
        category: categories.length > 0 ? categories : ['python'],
        _fromGitHub: true, // Internal flag to identify auto-detected projects
        _repoFullName: repo.full_name
    };
}

/**
 * Convert repo-name-like-this to "Repo Name Like This"
 */
function formatRepoName(name) {
    return name
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Convert topic-name to "Topic Name"
 */
function formatTopicAsTag(topic) {
    const specialNames = {
        'python': 'Python',
        'sql': 'SQL',
        'nlp': 'NLP',
        'ml': 'ML',
        'xgboost': 'XGBoost',
        'scikit-learn': 'Scikit-Learn',
        'tensorflow': 'TensorFlow',
        'pytorch': 'PyTorch',
        'tableau': 'Tableau',
        'pandas': 'Pandas',
        'numpy': 'NumPy',
        'machine-learning': 'Machine Learning',
        'deep-learning': 'Deep Learning',
        'data-science': 'Data Science',
        'data-analysis': 'Data Analysis',
        'data-visualization': 'Data Visualization',
        'web-scraping': 'Web Scraping',
        'r': 'R',
    };
    return specialNames[topic] || topic.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}


/**
 * Merge local projects with GitHub projects.
 * Local projects take priority (matched by GitHub URL).
 */
function mergeProjects(localProjects, githubProjects) {
    // Build a set of GitHub URLs from local projects for dedup
    const localGithubUrls = new Set(
        localProjects
            .filter(p => p.github)
            .map(p => p.github.toLowerCase().replace(/\/$/, ''))
    );

    // Only add GitHub projects that are NOT already in local projects
    const newFromGitHub = githubProjects.filter(ghProject => {
        const ghUrl = ghProject.github.toLowerCase().replace(/\/$/, '');
        return !localGithubUrls.has(ghUrl);
    });

    return [...localProjects, ...newFromGitHub];
}


/**
 * Main data loading function — loads both sources and merges
 */
async function loadAllProjects() {
    showLoading(true);

    // Fetch both sources in parallel
    const [localProjects, githubProjects] = await Promise.all([
        loadLocalProjects(),
        fetchGitHubProjects()
    ]);

    allProjects = mergeProjects(localProjects, githubProjects);

    showLoading(false);
    renderProjects();
    initFilters();
}


// ============================
// LOADING STATE
// ============================
function showLoading(show) {
    const grid = document.getElementById('projects-grid');
    const loader = document.getElementById('projects-loader');

    if (show) {
        if (loader) loader.style.display = 'flex';
        grid.style.display = 'none';
    } else {
        if (loader) loader.style.display = 'none';
        grid.style.display = '';
    }
}


// ============================
// RENDER PROJECT CARDS
// ============================
function renderProjects(filter = 'all') {
    const grid = document.getElementById('projects-grid');
    grid.innerHTML = '';

    const filtered = filter === 'all'
        ? allProjects
        : allProjects.filter(p => p.category.includes(filter));

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div class="projects-empty">
                <p>No projects found for this filter.</p>
            </div>
        `;
        return;
    }

    filtered.forEach((project, index) => {
        const card = document.createElement('div');
        card.className = 'project-card';
        card.setAttribute('data-categories', project.category.join(','));

        // GitHub badge for auto-detected projects
        const githubBadge = project._fromGitHub
            ? `<span class="github-auto-badge" title="Auto-detected from GitHub">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                    Auto
                </span>`
            : '';

        // Build tableau link HTML
        const tableauLink = project.tableau
            ? `<a href="${project.tableau}" target="_blank" rel="noopener" class="project-link">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                    Tableau
               </a>`
            : '';

        card.innerHTML = `
            <div class="project-card-image" onclick="openModal('${project.image}', '${project.title.replace(/'/g, "\\'")}')">
                <img src="${project.image}" alt="${project.title}" onerror="this.src='data:image/svg+xml,${encodeURIComponent(generatePlaceholderSVG(project.title))}'">
                <div class="image-overlay">
                    <div class="zoom-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
                    </div>
                </div>
            </div>
            <div class="project-card-body">
                <div class="project-card-header">
                    <h3 class="project-card-title">${project.title}</h3>
                    ${githubBadge}
                </div>
                <p class="project-card-desc">${project.description}</p>
                <div class="project-card-tags">
                    ${project.tags.map(tag => `<span class="project-tag">${tag}</span>`).join('')}
                </div>
                <div class="project-card-links">
                    <a href="${project.github}" target="_blank" rel="noopener" class="project-link">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                        GitHub
                    </a>
                    ${tableauLink}
                </div>
            </div>
        `;

        grid.appendChild(card);

        // Stagger animation
        setTimeout(() => {
            card.classList.add('visible');
        }, index * 100 + 100);
    });
}


// ============================
// PLACEHOLDER SVG GENERATOR
// ============================
// Generates a nice placeholder when the actual image is not found
function generatePlaceholderSVG(title) {
    const colors = [
        ['#6366f1', '#8b5cf6'],
        ['#8b5cf6', '#a78bfa'],
        ['#6366f1', '#a78bfa'],
        ['#4f46e5', '#7c3aed'],
    ];
    const [c1, c2] = colors[Math.floor(Math.random() * colors.length)];
    const initials = title.split(' ').map(w => w[0]).join('').substring(0, 3);

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400">
        <defs>
            <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:${c1};stop-opacity:1" />
                <stop offset="100%" style="stop-color:${c2};stop-opacity:1" />
            </linearGradient>
        </defs>
        <rect width="640" height="400" fill="url(#g)" rx="0"/>
        <text x="320" y="180" font-family="Inter,sans-serif" font-size="48" font-weight="700" fill="rgba(255,255,255,0.9)" text-anchor="middle">${initials}</text>
        <text x="320" y="230" font-family="Inter,sans-serif" font-size="16" fill="rgba(255,255,255,0.5)" text-anchor="middle">Tableau Visualization</text>
        <rect x="220" y="260" width="200" height="4" rx="2" fill="rgba(255,255,255,0.15)"/>
        <rect x="260" y="275" width="120" height="4" rx="2" fill="rgba(255,255,255,0.1)"/>
    </svg>`;
}


// ============================
// FILTER BUTTONS
// ============================
function initFilters() {
    const filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderProjects(btn.dataset.filter);
        });
    });
}


// ============================
// IMAGE MODAL
// ============================
function openModal(imageSrc, caption) {
    const modal = document.getElementById('image-modal');
    const modalImg = document.getElementById('modal-image');
    const modalCaption = document.getElementById('modal-caption');

    modalImg.src = imageSrc;
    modalImg.alt = caption;
    modalCaption.textContent = caption;

    // If the image fails to load, use placeholder
    modalImg.onerror = function () {
        this.src = 'data:image/svg+xml,' + encodeURIComponent(generatePlaceholderSVG(caption));
    };

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    const modal = document.getElementById('image-modal');
    modal.classList.remove('active');
    document.body.style.overflow = '';
}

function initModal() {
    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.querySelector('.modal-overlay').addEventListener('click', closeModal);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });
}


// ============================
// NAVBAR SCROLL EFFECT
// ============================
function initNavbar() {
    const navbar = document.getElementById('navbar');

    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });

    // Mobile toggle
    const navToggle = document.getElementById('nav-toggle');
    const navLinks = document.querySelector('.nav-links');

    navToggle.addEventListener('click', () => {
        navLinks.classList.toggle('active');
        navToggle.classList.toggle('active');
    });

    // Close mobile nav on link click
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.addEventListener('click', () => {
            navLinks.classList.remove('active');
            navToggle.classList.remove('active');
        });
    });
}


// ============================
// SCROLL REVEAL ANIMATION
// ============================
function initScrollReveal() {
    const revealElements = document.querySelectorAll(
        '.section-title, .section-subtitle, .about-text, .about-stats, .skill-category, .contact-content, .project-filters'
    );

    revealElements.forEach(el => el.classList.add('reveal'));

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('revealed');
                observer.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    });

    revealElements.forEach(el => observer.observe(el));
}


// ============================
// COUNTER ANIMATION
// ============================
function initCounters() {
    const counters = document.querySelectorAll('.stat-number');

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const el = entry.target;
                const target = parseInt(el.getAttribute('data-count'));
                animateCounter(el, target);
                observer.unobserve(el);
            }
        });
    }, { threshold: 0.5 });

    counters.forEach(counter => observer.observe(counter));
}

function animateCounter(el, target) {
    let current = 0;
    const duration = 1500;
    const step = target / (duration / 16);

    function update() {
        current += step;
        if (current >= target) {
            el.textContent = target;
            return;
        }
        el.textContent = Math.floor(current);
        requestAnimationFrame(update);
    }

    requestAnimationFrame(update);
}


// ============================
// HERO PARTICLES
// ============================
function initParticles() {
    const container = document.getElementById('hero-particles');
    const count = 30;

    for (let i = 0; i < count; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.top = Math.random() * 100 + '%';
        particle.style.animationDelay = Math.random() * 8 + 's';
        particle.style.animationDuration = (Math.random() * 4 + 6) + 's';
        particle.style.width = (Math.random() * 3 + 1) + 'px';
        particle.style.height = particle.style.width;
        const hue = Math.random() > 0.5 ? '239' : '259';
        particle.style.background = `hsl(${hue}, 80%, 70%)`;
        container.appendChild(particle);
    }
}


// ============================
// SMOOTH SCROLL
// ============================
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });
}


// ============================
// INIT
// ============================
document.addEventListener('DOMContentLoaded', () => {
    initNavbar();
    initParticles();
    initSmoothScroll();
    initModal();
    initScrollReveal();
    initCounters();

    // Load projects from JSON + GitHub API
    loadAllProjects();
});
