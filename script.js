// ============================
// CONFIGURATION
// ============================
// Cache GitHub API results for 1 hour to avoid rate limiting (60 req/hr unauthenticated)
const GITHUB_CACHE_KEY = "portfolio_github_cache";
const GITHUB_CACHE_DURATION = 60 * 60 * 1000; // 1 hour in ms

// ============================
// STATE
// ============================
let allProjects = [];
let githubUsername = "KemasMhd";

// ============================
// DATA LOADING
// ============================

/**
 * Load projects from local projects.json file
 */
async function loadLocalProjects() {
  try {
    const res = await fetch("projects.json");
    if (!res.ok) throw new Error("Failed to load projects.json");
    const data = await res.json();
    githubUsername = data.githubUsername || githubUsername;
    return data.projects || [];
  } catch (err) {
    console.warn("⚠️ Could not load projects.json:", err.message);
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
        console.log("📦 Using cached GitHub data");
        return data;
      }
    }
  } catch (e) {
    // Cache read failed, continue to fetch
  }

  try {
    const res = await fetch(
      `https://api.github.com/users/${githubUsername}/repos?per_page=100&sort=updated`,
      { headers: { Accept: "application/vnd.github.mercy-preview+json" } }
    );

    if (!res.ok) {
      if (res.status === 403)
        console.warn(
          "⚠️ GitHub API rate limit reached. Using cached/local data."
        );
      throw new Error(`GitHub API error: ${res.status}`);
    }

    const repos = await res.json();

    // Filter repos that have the "portfolio" topic
    const portfolioRepos = repos
      .filter((repo) => repo.topics && repo.topics.includes("portfolio"))
      .map((repo) => mapGitHubRepoToProject(repo));

    // Save to cache
    try {
      localStorage.setItem(
        GITHUB_CACHE_KEY,
        JSON.stringify({
          data: portfolioRepos,
          timestamp: Date.now(),
        })
      );
    } catch (e) {
      // localStorage might be full, ignore
    }

    console.log(
      `🐙 Fetched ${portfolioRepos.length} portfolio repos from GitHub`
    );
    return portfolioRepos;
  } catch (err) {
    console.warn("⚠️ Could not fetch GitHub repos:", err.message);
    return [];
  }
}

/**
 * Map a GitHub API repo object to our project card format
 */
function mapGitHubRepoToProject(repo) {
  // Convert topic names to categories for filtering
  const topicToCategoryMap = {
    python: "python",
    tableau: "tableau",
    "machine-learning": "ml",
    ml: "ml",
    "deep-learning": "ml",
    "data-science": "python",
    sql: "python",
    nlp: "ml",
  };

  const categories = [];
  const tags = [];

  (repo.topics || []).forEach((topic) => {
    if (topic === "portfolio") return; // skip the marker topic
    // Add to tags (formatted nicely)
    tags.push(formatTopicAsTag(topic));
    // Map to category if applicable
    if (
      topicToCategoryMap[topic] &&
      !categories.includes(topicToCategoryMap[topic])
    ) {
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
    description: repo.description || "No description available.",
    image: "", // GitHub repos won't have local images, placeholder will be used
    github: repo.html_url,
    tableau: repo.homepage || "", // Use homepage field for Tableau/demo link
    tags: tags.length > 0 ? tags : ["Data Science"],
    category: categories.length > 0 ? categories : ["python"],
    _fromGitHub: true, // Internal flag to identify auto-detected projects
    _repoFullName: repo.full_name,
  };
}

/**
 * Convert repo-name-like-this to "Repo Name Like This"
 */
function formatRepoName(name) {
  return name.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Convert topic-name to "Topic Name"
 */
function formatTopicAsTag(topic) {
  const specialNames = {
    python: "Python",
    sql: "SQL",
    nlp: "NLP",
    ml: "ML",
    xgboost: "XGBoost",
    "scikit-learn": "Scikit-Learn",
    tensorflow: "TensorFlow",
    pytorch: "PyTorch",
    tableau: "Tableau",
    pandas: "Pandas",
    numpy: "NumPy",
    "machine-learning": "Machine Learning",
    "deep-learning": "Deep Learning",
    "data-science": "Data Science",
    "data-analysis": "Data Analysis",
    "data-visualization": "Data Visualization",
    "web-scraping": "Web Scraping",
    r: "R",
  };
  return (
    specialNames[topic] ||
    topic.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

/**
 * Merge local projects with GitHub projects.
 * Local projects take priority (matched by GitHub URL).
 */
function mergeProjects(localProjects, githubProjects) {
  // Build a set of GitHub URLs from local projects for dedup
  const localGithubUrls = new Set(
    localProjects
      .filter((p) => p.github)
      .map((p) => p.github.toLowerCase().replace(/\/$/, ""))
  );

  // Only add GitHub projects that are NOT already in local projects
  const newFromGitHub = githubProjects.filter((ghProject) => {
    const ghUrl = ghProject.github.toLowerCase().replace(/\/$/, "");
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
    fetchGitHubProjects(),
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
  const grid = document.getElementById("projects-grid");
  const loader = document.getElementById("projects-loader");

  if (show) {
    if (loader) loader.style.display = "flex";
    grid.style.display = "none";
  } else {
    if (loader) loader.style.display = "none";
    grid.style.display = "";
  }
}

// ============================
// RENDER PROJECT CARDS
// ============================
function renderProjects(filter = "all") {
  const grid = document.getElementById("projects-grid");
  grid.innerHTML = "";

  const filtered =
    filter === "all"
      ? allProjects
      : allProjects.filter((p) => p.category.includes(filter));

  if (filtered.length === 0) {
    grid.innerHTML = `
            <div class="projects-empty">
                <p>No projects found for this filter.</p>
            </div>
        `;
    return;
  }

  filtered.forEach((project, index) => {
    const card = document.createElement("div");
    card.className = "project-card";
    card.setAttribute("data-categories", project.category.join(","));

    // GitHub badge for auto-detected projects
    const githubBadge = project._fromGitHub
      ? `<span class="github-auto-badge" title="Auto-detected from GitHub">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                    Auto
                </span>`
      : "";

    // Build tableau link HTML
    const tableauLink = project.tableau
      ? `<a href="${project.tableau}" target="_blank" rel="noopener" class="project-link" onclick="event.stopPropagation()">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                    Tableau
               </a>`
      : "";

    card.innerHTML = `
            <div class="project-card-image">
                <img src="${project.image}" alt="${
      project.title
    }" onerror="this.src='data:image/svg+xml,${encodeURIComponent(
      generatePlaceholderSVG(project.title)
    )}'">
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
                    ${project.tags
                      .map((tag) => `<span class="project-tag">${tag}</span>`)
                      .join("")}
                </div>
                <div class="project-card-links">
                    <a href="${
                      project.github
                    }" target="_blank" rel="noopener" class="project-link" onclick="event.stopPropagation()">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                        GitHub
                    </a>
                    ${tableauLink}
                </div>
            </div>
        `;

    // Make entire card clickable to open project detail modal
    card.style.cursor = "pointer";
    card.addEventListener("click", (e) => {
      // Don't open modal if a link was clicked
      if (e.target.closest("a")) return;
      openProjectModal(project);
    });

    grid.appendChild(card);

    // Stagger animation
    setTimeout(() => {
      card.classList.add("visible");
    }, index * 100 + 100);
  });
}

// ============================
// PLACEHOLDER SVG GENERATOR
// ============================
// Generates a nice placeholder when the actual image is not found
function generatePlaceholderSVG(title) {
  const colors = [
    ["#6366f1", "#8b5cf6"],
    ["#8b5cf6", "#a78bfa"],
    ["#6366f1", "#a78bfa"],
    ["#4f46e5", "#7c3aed"],
  ];
  const [c1, c2] = colors[Math.floor(Math.random() * colors.length)];
  const initials = title
    .split(" ")
    .map((w) => w[0])
    .join("")
    .substring(0, 3);

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
  const filterBtns = document.querySelectorAll(".filter-btn");
  filterBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      filterBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      renderProjects(btn.dataset.filter);
    });
  });
}

// ============================
// IMAGE MODAL (legacy)
// ============================
function openModal(imageSrc, caption) {
  const modal = document.getElementById("image-modal");
  const modalImg = document.getElementById("modal-image");
  const modalCaption = document.getElementById("modal-caption");

  modalImg.src = imageSrc;
  modalImg.alt = caption;
  modalCaption.textContent = caption;

  modalImg.onerror = function () {
    this.src =
      "data:image/svg+xml," +
      encodeURIComponent(generatePlaceholderSVG(caption));
  };

  modal.classList.add("active");
  document.body.style.overflow = "hidden";
}

function closeModal() {
  const modal = document.getElementById("image-modal");
  modal.classList.remove("active");
  document.body.style.overflow = "";
}

function initModal() {
  document.getElementById("modal-close").addEventListener("click", closeModal);
  document
    .querySelector(".modal-overlay")
    .addEventListener("click", closeModal);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeModal();
      closeProjectModal();
    }
  });
}

// ============================
// PROJECT DETAIL MODAL + SLIDER
// ============================
let currentSlide = 0;
let totalSlides = 0;

function openProjectModal(project) {
  const modal = document.getElementById("project-modal");
  const track = document.getElementById("project-slider-track");
  const dotsContainer = document.getElementById("slider-dots");

  // Populate info
  document.getElementById("project-modal-title").textContent = project.title;
  document.getElementById("project-modal-desc").textContent =
    project.description;

  // Tags
  const tagsEl = document.getElementById("project-modal-tags");
  tagsEl.innerHTML = project.tags
    .map((t) => `<span class="project-tag">${t}</span>`)
    .join("");

  // Links
  const linksEl = document.getElementById("project-modal-links");
  let linksHTML = "";
  if (project.github) {
    linksHTML += `<a href="${project.github}" target="_blank" rel="noopener" class="project-link">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
            GitHub
        </a>`;
  }
  if (project.tableau) {
    linksHTML += `<a href="${project.tableau}" target="_blank" rel="noopener" class="project-link">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
            Tableau
        </a>`;
  }
  linksEl.innerHTML = linksHTML;

  // Build slides — use images array, fall back to single image, then placeholder
  const images =
    project.images && project.images.length > 0
      ? project.images
      : project.image
      ? [project.image]
      : [];

  if (images.length === 0) {
    // No images — show placeholder
    const placeholderSrc =
      "data:image/svg+xml," +
      encodeURIComponent(generatePlaceholderSVG(project.title));
    images.push(placeholderSrc);
  }

  totalSlides = images.length;
  currentSlide = 0;

  track.innerHTML = images
    .map(
      (src, i) => `
        <div class="slide">
            <img src="${src}" alt="${project.title} — slide ${
        i + 1
      }" onerror="this.src='data:image/svg+xml,${encodeURIComponent(
        generatePlaceholderSVG(project.title)
      )}'">
        </div>
    `
    )
    .join("");

  // Dots
  if (totalSlides > 1) {
    dotsContainer.innerHTML = images
      .map(
        (_, i) =>
          `<button class="slider-dot${
            i === 0 ? " active" : ""
          }" data-index="${i}" aria-label="Slide ${i + 1}"></button>`
      )
      .join("");
    dotsContainer.style.display = "flex";
  } else {
    dotsContainer.innerHTML = "";
    dotsContainer.style.display = "none";
  }

  // Show/hide nav buttons
  updateSliderButtons();
  updateSliderPosition();

  modal.classList.add("active");
  document.body.style.overflow = "hidden";
}

function closeProjectModal() {
  const modal = document.getElementById("project-modal");
  modal.classList.remove("active");
  document.body.style.overflow = "";
}

function goToSlide(index) {
  if (index < 0 || index >= totalSlides) return;
  currentSlide = index;
  updateSliderPosition();
  updateSliderButtons();
  updateSliderDots();
}

function updateSliderPosition() {
  const track = document.getElementById("project-slider-track");
  track.style.transform = `translateX(-${currentSlide * 100}%)`;
}

function updateSliderButtons() {
  const prevBtn = document.getElementById("slider-prev");
  const nextBtn = document.getElementById("slider-next");
  if (totalSlides <= 1) {
    prevBtn.style.display = "none";
    nextBtn.style.display = "none";
  } else {
    prevBtn.style.display = "flex";
    nextBtn.style.display = "flex";
    prevBtn.style.opacity = currentSlide === 0 ? "0.3" : "";
    nextBtn.style.opacity = currentSlide === totalSlides - 1 ? "0.3" : "";
  }
}

function updateSliderDots() {
  const dots = document.querySelectorAll("#slider-dots .slider-dot");
  dots.forEach((dot, i) => {
    dot.classList.toggle("active", i === currentSlide);
  });
}

function initProjectModal() {
  // Close handlers
  document
    .getElementById("project-modal-close")
    .addEventListener("click", closeProjectModal);
  document
    .querySelector(".project-modal-overlay")
    .addEventListener("click", closeProjectModal);

  // Slider navigation
  document
    .getElementById("slider-prev")
    .addEventListener("click", () => goToSlide(currentSlide - 1));
  document
    .getElementById("slider-next")
    .addEventListener("click", () => goToSlide(currentSlide + 1));

  // Dot clicks
  document.getElementById("slider-dots").addEventListener("click", (e) => {
    const dot = e.target.closest(".slider-dot");
    if (dot) goToSlide(parseInt(dot.dataset.index));
  });

  // Touch swipe support for slider
  let touchStartX = 0;
  let touchEndX = 0;
  const slider = document.getElementById("project-slider");

  slider.addEventListener(
    "touchstart",
    (e) => {
      touchStartX = e.changedTouches[0].screenX;
    },
    { passive: true }
  );

  slider.addEventListener("touchend", (e) => {
    touchEndX = e.changedTouches[0].screenX;
    const diff = touchStartX - touchEndX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) goToSlide(currentSlide + 1);
      else goToSlide(currentSlide - 1);
    }
  });
}

// ============================
// NAVBAR SCROLL EFFECT
// ============================
function initNavbar() {
  const navbar = document.getElementById("navbar");

  window.addEventListener("scroll", () => {
    if (window.scrollY > 50) {
      navbar.classList.add("scrolled");
    } else {
      navbar.classList.remove("scrolled");
    }
  });

  // Mobile toggle
  const navToggle = document.getElementById("nav-toggle");
  const navLinks = document.querySelector(".nav-links");

  navToggle.addEventListener("click", () => {
    navLinks.classList.toggle("active");
    navToggle.classList.toggle("active");
  });

  // Close mobile nav on link click
  document.querySelectorAll(".nav-links a").forEach((link) => {
    link.addEventListener("click", () => {
      navLinks.classList.remove("active");
      navToggle.classList.remove("active");
    });
  });
}

// ============================
// SCROLL REVEAL ANIMATION
// ============================
function initScrollReveal() {
  const revealElements = document.querySelectorAll(
    ".section-title, .section-subtitle, .about-text, .about-stats, .skill-category, .contact-content, .project-filters"
  );

  revealElements.forEach((el) => el.classList.add("reveal"));

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("revealed");
          observer.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.1,
      rootMargin: "0px 0px -50px 0px",
    }
  );

  revealElements.forEach((el) => observer.observe(el));
}

// ============================
// COUNTER ANIMATION
// ============================
function initCounters() {
  const counters = document.querySelectorAll(".stat-number");

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const el = entry.target;
          const target = parseInt(el.getAttribute("data-count"));
          animateCounter(el, target);

          // Also animate the progress bar in the same card
          const card = el.closest(".stat-card");
          if (card) {
            const barFill = card.querySelector(".stat-bar-fill");
            if (barFill) {
              const targetWidth = barFill.getAttribute("data-width") || 50;
              setTimeout(() => {
                barFill.style.width = targetWidth + "%";
              }, 300);
            }
          }

          observer.unobserve(el);
        }
      });
    },
    { threshold: 0.5 }
  );

  counters.forEach((counter) => observer.observe(counter));
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
// INTERACTIVE PARTICLE NETWORK
// ============================
function initParticles() {
  const canvas = document.getElementById("hero-canvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const hero = canvas.closest(".hero");

  let width, height;
  let particles = [];
  let mouse = { x: -1000, y: -1000, radius: 150 };
  let animationId;

  const CONFIG = {
    particleCount: window.innerWidth < 768 ? 40 : 70,
    maxSpeed: 0.4,
    connectionDistance: 140,
    mouseConnectionDistance: 200,
    particleMinSize: 1,
    particleMaxSize: 3,
    colors: [
      "rgba(99, 102, 241, ", // indigo
      "rgba(139, 92, 246, ", // violet
      "rgba(167, 139, 250, ", // light violet
      "rgba(129, 140, 248, ", // periwinkle
    ],
    mouseGlowColor: "rgba(99, 102, 241, 0.08)",
  };

  class Particle {
    constructor() {
      this.reset();
    }

    reset() {
      this.x = Math.random() * width;
      this.y = Math.random() * height;
      this.vx = (Math.random() - 0.5) * CONFIG.maxSpeed * 2;
      this.vy = (Math.random() - 0.5) * CONFIG.maxSpeed * 2;
      this.size =
        Math.random() * (CONFIG.particleMaxSize - CONFIG.particleMinSize) +
        CONFIG.particleMinSize;
      this.colorBase =
        CONFIG.colors[Math.floor(Math.random() * CONFIG.colors.length)];
      this.opacity = Math.random() * 0.5 + 0.3;
      this.pulseSpeed = Math.random() * 0.02 + 0.005;
      this.pulsePhase = Math.random() * Math.PI * 2;
    }

    update(time) {
      // Drift movement
      this.x += this.vx;
      this.y += this.vy;

      // Pulse opacity
      this.currentOpacity =
        this.opacity +
        Math.sin(time * this.pulseSpeed + this.pulsePhase) * 0.15;

      // Mouse interaction — gentle repulsion and attraction
      const dx = this.x - mouse.x;
      const dy = this.y - mouse.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < mouse.radius) {
        const force = (1 - dist / mouse.radius) * 0.02;
        this.vx += dx * force;
        this.vy += dy * force;
      }

      // Speed damping
      const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
      if (speed > CONFIG.maxSpeed) {
        this.vx *= CONFIG.maxSpeed / speed;
        this.vy *= CONFIG.maxSpeed / speed;
      }

      // Wrap around edges with padding
      const pad = 20;
      if (this.x < -pad) this.x = width + pad;
      if (this.x > width + pad) this.x = -pad;
      if (this.y < -pad) this.y = height + pad;
      if (this.y > height + pad) this.y = -pad;
    }

    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fillStyle = this.colorBase + this.currentOpacity + ")";
      ctx.fill();

      // Subtle glow for larger particles
      if (this.size > 2) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * 3, 0, Math.PI * 2);
        ctx.fillStyle = this.colorBase + this.currentOpacity * 0.1 + ")";
        ctx.fill();
      }
    }
  }

  function drawConnections(time) {
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < CONFIG.connectionDistance) {
          const opacity = (1 - dist / CONFIG.connectionDistance) * 0.15;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(99, 102, 241, ${opacity})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }

      // Mouse connections — brighter lines to nearby particles
      const dxm = particles[i].x - mouse.x;
      const dym = particles[i].y - mouse.y;
      const distm = Math.sqrt(dxm * dxm + dym * dym);

      if (distm < CONFIG.mouseConnectionDistance) {
        const opacity = (1 - distm / CONFIG.mouseConnectionDistance) * 0.3;
        ctx.beginPath();
        ctx.moveTo(particles[i].x, particles[i].y);
        ctx.lineTo(mouse.x, mouse.y);
        ctx.strokeStyle = `rgba(139, 92, 246, ${opacity})`;
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    }
  }

  function drawMouseGlow() {
    if (mouse.x < 0 || mouse.y < 0) return;
    const gradient = ctx.createRadialGradient(
      mouse.x,
      mouse.y,
      0,
      mouse.x,
      mouse.y,
      200
    );
    gradient.addColorStop(0, "rgba(99, 102, 241, 0.06)");
    gradient.addColorStop(0.5, "rgba(139, 92, 246, 0.02)");
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(mouse.x - 200, mouse.y - 200, 400, 400);
  }

  function animate(time) {
    ctx.clearRect(0, 0, width, height);

    drawMouseGlow();
    drawConnections(time);

    particles.forEach((p) => {
      p.update(time);
      p.draw();
    });

    animationId = requestAnimationFrame(animate);
  }

  function resize() {
    const rect = hero.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = rect.width;
    height = rect.height;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.scale(dpr, dpr);
  }

  function init() {
    resize();
    particles = [];
    for (let i = 0; i < CONFIG.particleCount; i++) {
      particles.push(new Particle());
    }
  }

  // Mouse tracking (relative to hero section)
  hero.addEventListener("mousemove", (e) => {
    const rect = hero.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  });

  hero.addEventListener("mouseleave", () => {
    mouse.x = -1000;
    mouse.y = -1000;
  });

  // Touch support
  hero.addEventListener(
    "touchmove",
    (e) => {
      const rect = hero.getBoundingClientRect();
      mouse.x = e.touches[0].clientX - rect.left;
      mouse.y = e.touches[0].clientY - rect.top;
    },
    { passive: true }
  );

  hero.addEventListener("touchend", () => {
    mouse.x = -1000;
    mouse.y = -1000;
  });

  window.addEventListener("resize", () => {
    if (animationId) cancelAnimationFrame(animationId);
    init();
    animate(0);
  });

  init();
  animate(0);
}

// ============================
// SKILLS SECTION — HEX GRID
// ============================
function initSkillsBackground() {
  const canvas = document.getElementById("skills-canvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const section = canvas.closest(".skills");

  let width, height;
  let mouse = { x: -1000, y: -1000 };
  let animationId;
  let isVisible = false;

  const hexSize = window.innerWidth < 768 ? 35 : 28;
  const hexHeight = hexSize * Math.sqrt(3);

  function resize() {
    const rect = section.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = rect.width;
    height = rect.height;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawHex(cx, cy, size) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 6;
      const x = cx + size * Math.cos(angle);
      const y = cy + size * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function animate(time) {
    if (!isVisible) {
      animationId = requestAnimationFrame(animate);
      return;
    }

    ctx.clearRect(0, 0, width, height);

    const colWidth = hexSize * 1.5;
    const cols = Math.ceil(width / colWidth) + 2;
    const rows = Math.ceil(height / hexHeight) + 2;

    for (let col = -1; col < cols; col++) {
      for (let row = -1; row < rows; row++) {
        const cx = col * colWidth;
        const cy = row * hexHeight + (col % 2 === 0 ? 0 : hexHeight / 2);

        // Distance from mouse
        const dx = cx - mouse.x;
        const dy = cy - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const mouseRadius = 180;

        // Base pulse
        const pulse = Math.sin(time * 0.0005 + col * 0.3 + row * 0.2) * 0.02;
        let opacity = 0.04 + pulse;
        let strokeColor = `rgba(99, 102, 241, ${opacity})`;

        // Mouse highlight
        if (dist < mouseRadius) {
          const proximity = 1 - dist / mouseRadius;
          opacity = 0.04 + proximity * 0.2;
          const r = Math.round(99 + proximity * 40);
          const g = Math.round(102 - proximity * 10);
          const b = Math.round(241 + proximity * 5);
          strokeColor = `rgba(${r}, ${g}, ${b}, ${opacity})`;

          // Glow fill on close hexagons
          if (proximity > 0.5) {
            drawHex(cx, cy, hexSize - 2);
            ctx.fillStyle = `rgba(139, 92, 246, ${proximity * 0.04})`;
            ctx.fill();
          }
        }

        drawHex(cx, cy, hexSize - 2);
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }

    animationId = requestAnimationFrame(animate);
  }

  const visibilityObserver = new IntersectionObserver(
    (entries) => {
      isVisible = entries[0].isIntersecting;
    },
    { threshold: 0 }
  );
  visibilityObserver.observe(section);

  section.addEventListener("mousemove", (e) => {
    const rect = section.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  });

  section.addEventListener("mouseleave", () => {
    mouse.x = -1000;
    mouse.y = -1000;
  });

  window.addEventListener("resize", () => {
    if (animationId) cancelAnimationFrame(animationId);
    resize();
    animate(0);
  });

  resize();
  animate(0);
}

// ============================
// CONTACT SECTION — AURORA
// ============================
function initContactBackground() {
  const canvas = document.getElementById("contact-canvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const section = canvas.closest(".contact");

  let width, height;
  let blobs = [];
  let mouse = { x: -1000, y: -1000, smoothX: -1000, smoothY: -1000 };
  let animationId;
  let isVisible = false;

  class Blob {
    constructor(index, total) {
      this.speed = 0.0002 + Math.random() * 0.0003;
      this.radiusX = 0.12 + Math.random() * 0.18;
      this.radiusY = 0.08 + Math.random() * 0.12;
      this.orbitX = 0.2 + Math.random() * 0.6;
      this.orbitY = 0.2 + Math.random() * 0.6;
      this.size = 180 + Math.random() * 180;
      this.phaseOffset = Math.random() * Math.PI * 2;

      const colors = [
        { r: 99, g: 102, b: 241 },
        { r: 139, g: 92, b: 246 },
        { r: 79, g: 70, b: 229 },
        { r: 129, g: 140, b: 248 },
        { r: 167, g: 139, b: 250 },
      ];
      this.color = colors[index % colors.length];
      this.baseOpacity = 0.025 + Math.random() * 0.02;
    }

    update(time) {
      const t = time * this.speed + this.phaseOffset;
      this.x = width * (this.orbitX + Math.sin(t) * this.radiusX);
      this.y = height * (this.orbitY + Math.cos(t * 0.7) * this.radiusY);

      if (mouse.smoothX > 0 && mouse.smoothY > 0) {
        const dx = mouse.smoothX - this.x;
        const dy = mouse.smoothY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 350) {
          const pull = (1 - dist / 350) * 0.06;
          this.x += dx * pull;
          this.y += dy * pull;
        }
      }

      this.currentSize =
        this.size + Math.sin(time * 0.0005 + this.phaseOffset) * 30;
      this.currentOpacity =
        this.baseOpacity + Math.sin(time * 0.0003 + this.phaseOffset) * 0.008;
    }

    draw() {
      const gradient = ctx.createRadialGradient(
        this.x,
        this.y,
        0,
        this.x,
        this.y,
        this.currentSize
      );
      const { r, g, b } = this.color;
      gradient.addColorStop(
        0,
        `rgba(${r}, ${g}, ${b}, ${this.currentOpacity})`
      );
      gradient.addColorStop(
        0.5,
        `rgba(${r}, ${g}, ${b}, ${this.currentOpacity * 0.4})`
      );
      gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

      ctx.fillStyle = gradient;
      ctx.fillRect(
        this.x - this.currentSize,
        this.y - this.currentSize,
        this.currentSize * 2,
        this.currentSize * 2
      );
    }
  }

  function resize() {
    const rect = section.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = rect.width;
    height = rect.height;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function init() {
    blobs = [];
    const count = window.innerWidth < 768 ? 3 : 5;
    for (let i = 0; i < count; i++) {
      blobs.push(new Blob(i, count));
    }
  }

  function animate(time) {
    if (!isVisible) {
      animationId = requestAnimationFrame(animate);
      return;
    }

    mouse.smoothX += (mouse.x - mouse.smoothX) * 0.05;
    mouse.smoothY += (mouse.y - mouse.smoothY) * 0.05;

    ctx.clearRect(0, 0, width, height);

    if (mouse.smoothX > 0 && mouse.smoothY > 0) {
      const glow = ctx.createRadialGradient(
        mouse.smoothX,
        mouse.smoothY,
        0,
        mouse.smoothX,
        mouse.smoothY,
        200
      );
      glow.addColorStop(0, "rgba(139, 92, 246, 0.025)");
      glow.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(mouse.smoothX - 200, mouse.smoothY - 200, 400, 400);
    }

    blobs.forEach((blob) => {
      blob.update(time);
      blob.draw();
    });

    animationId = requestAnimationFrame(animate);
  }

  const visibilityObserver = new IntersectionObserver(
    (entries) => {
      isVisible = entries[0].isIntersecting;
    },
    { threshold: 0 }
  );
  visibilityObserver.observe(section);

  section.addEventListener("mousemove", (e) => {
    const rect = section.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  });

  section.addEventListener("mouseleave", () => {
    mouse.x = -1000;
    mouse.y = -1000;
  });

  window.addEventListener("resize", () => {
    if (animationId) cancelAnimationFrame(animationId);
    resize();
    init();
    animate(0);
  });

  resize();
  init();
  animate(0);
}

// ============================
// SMOOTH SCROLL
// ============================
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", function (e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute("href"));
      if (target) {
        target.scrollIntoView({ behavior: "smooth" });
      }
    });
  });
}

// ============================
// INIT
// ============================
document.addEventListener("DOMContentLoaded", () => {
  initNavbar();
  initParticles();
  initSkillsBackground();
  initContactBackground();
  initSmoothScroll();
  initModal();
  initProjectModal();
  initScrollReveal();
  initCounters();

  // Load projects from JSON + GitHub API
  loadAllProjects();
});
