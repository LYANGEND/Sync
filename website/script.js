/**
 * SYNC SCHOOL MANAGEMENT SYSTEM - WEBSITE
 * Interactive JavaScript - Enhanced & Responsive
 */

const API_BASE_URL = 'http://localhost:3000/api/v1';

document.addEventListener('DOMContentLoaded', () => {
    // ==========================================
    // NAVBAR SCROLL EFFECT
    // ==========================================
    const navbar = document.getElementById('navbar');

    const handleScroll = () => {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll(); // Check initial state

    // ==========================================
    // MOBILE MENU TOGGLE
    // ==========================================
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');

    if (mobileMenuBtn && mobileMenu) {
        mobileMenuBtn.addEventListener('click', () => {
            mobileMenuBtn.classList.toggle('active');
            mobileMenu.classList.toggle('active');

            // Prevent body scroll when menu is open
            if (mobileMenu.classList.contains('active')) {
                document.body.style.overflow = 'hidden';
            } else {
                document.body.style.overflow = '';
            }
        });

        // Close menu when clicking on links
        const mobileLinks = mobileMenu.querySelectorAll('a');
        mobileLinks.forEach(link => {
            link.addEventListener('click', () => {
                mobileMenuBtn.classList.remove('active');
                mobileMenu.classList.remove('active');
                document.body.style.overflow = '';
            });
        });
    }

    // ==========================================
    // SMOOTH SCROLLING FOR ANCHOR LINKS
    // ==========================================
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const href = this.getAttribute('href');
            if (href === '#') return;

            e.preventDefault();
            const target = document.querySelector(href);
            if (target) {
                const navHeight = navbar.offsetHeight;
                const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - navHeight - 20;

                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });

    // ==========================================
    // MODULE TABS SWITCHING
    // ==========================================
    const tabBtns = document.querySelectorAll('.tab-btn');
    const modulePanels = document.querySelectorAll('.module-panel');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;

            // Remove active from all
            tabBtns.forEach(b => b.classList.remove('active'));
            modulePanels.forEach(p => p.classList.remove('active'));

            // Add active to clicked
            btn.classList.add('active');
            const targetPanel = document.getElementById(`${tabId}-panel`);
            if (targetPanel) {
                targetPanel.classList.add('active');
            }
        });
    });

    // ==========================================
    // DYNAMIC PRICING FROM API
    // ==========================================
    loadPricing();

    // ==========================================
    // CONTACT FORM SUBMISSION
    // ==========================================
    const contactForm = document.getElementById('contact-form');

    if (contactForm) {
        contactForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            // Get form data
            const formData = new FormData(contactForm);
            const data = Object.fromEntries(formData.entries());

            // Simple validation
            if (!data.name || !data.email || !data.message) {
                showNotification('Please fill in all required fields.', 'error');
                return;
            }

            // Email validation
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(data.email)) {
                showNotification('Please enter a valid email address.', 'error');
                return;
            }

            const submitBtn = contactForm.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;
            submitBtn.textContent = 'Sending...';
            submitBtn.disabled = true;

            try {
                const response = await fetch(`${API_BASE_URL}/website/contact`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(data)
                });

                const result = await response.json();

                if (response.ok) {
                    showNotification('Thank you! We\'ll be in touch shortly.', 'success');
                    contactForm.reset();
                } else {
                    showNotification(result.error || 'Failed to send message. Please try again.', 'error');
                }
            } catch (error) {
                console.error('Contact form error:', error);
                showNotification('Network error. Please try again later.', 'error');
            } finally {
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
            }
        });
    }

    // ==========================================
    // LOAD PRICING PLANS
    // ==========================================
    const loadPlans = async () => {
        const pricingGrid = document.querySelector('.pricing-grid');
        if (!pricingGrid) return;

        try {
            const response = await fetch(`${API_BASE_URL}/subscription/plans`);
            if (!response.ok) throw new Error('Failed to fetch fees');

            const { plans, featureLabels } = await response.json();

            if (!plans || plans.length === 0) return; // Keep default if no plans

            // Clear existing static plans
            pricingGrid.innerHTML = '';

            plans.forEach(plan => {
                const isPopular = plan.isPopular;
                const featuresHtml = plan.features.map(f => {
                    // Try to get label from featureLabels, else format key
                    const label = (featureLabels && featureLabels[f]) || f.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                    return `<li><span class="check">✓</span> ${label}</li>`;
                }).join('');

                const price = Number(plan.monthlyPriceZMW).toLocaleString();

                const cardHtml = `
                    <div class="pricing-card ${isPopular ? 'popular' : ''}">
                        ${isPopular ? '<div class="popular-badge">Most Popular</div>' : ''}
                        <div class="pricing-header">
                            <h3>${plan.name}</h3>
                            <p>${plan.description || 'Suitable for your school'}</p>
                        </div>
                        <div class="pricing-price">
                            <span class="currency">ZMW</span>
                            <span class="amount">${price}</span>
                            <span class="period">/month</span>
                        </div>
                        <ul class="pricing-features">
                            <li><span class="check">✓</span> Up to ${plan.maxStudents === 0 ? 'Unlimited' : plan.maxStudents} students</li>
                            ${featuresHtml}
                        </ul>
                        <a href="#contact" class="btn ${isPopular ? 'btn-primary' : 'btn-outline'} btn-block">Get Started</a>
                    </div>
                `;
                pricingGrid.innerHTML += cardHtml;
            });

            // Re-run animation observer for new elements
            setTimeout(animateOnScroll, 100);

        } catch (error) {
            console.error('Error loading plans:', error);
            // Fallback to static content if API fails (already in HTML)
        }
    };

    // Load plans on startup
    loadPlans();


    // ==========================================
    // NOTIFICATION SYSTEM
    // ==========================================
    function showNotification(message, type = 'success') {
        // Remove existing notifications
        const existing = document.querySelector('.notification');
        if (existing) existing.remove();

        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <span>${message}</span>
            <button class="notification-close">&times;</button>
        `;

        // Styles
        Object.assign(notification.style, {
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            left: window.innerWidth <= 480 ? '24px' : 'auto',
            padding: '16px 24px',
            borderRadius: '12px',
            background: type === 'success' ? '#10B981' : '#EF4444',
            color: 'white',
            fontWeight: '500',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
            zIndex: '9999',
            animation: 'slideIn 0.3s ease',
            fontSize: '14px'
        });

        // Add animation keyframes
        if (!document.getElementById('notification-styles')) {
            const style = document.createElement('style');
            style.id = 'notification-styles';
            style.textContent = `
                @keyframes slideIn {
                    from { transform: translateY(100%); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                @keyframes slideOut {
                    from { transform: translateY(0); opacity: 1; }
                    to { transform: translateY(100%); opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(notification);

        // Close button
        const closeBtn = notification.querySelector('.notification-close');
        Object.assign(closeBtn.style, {
            background: 'none',
            border: 'none',
            color: 'white',
            fontSize: '20px',
            cursor: 'pointer',
            padding: '0',
            lineHeight: '1'
        });

        closeBtn.addEventListener('click', () => {
            notification.style.animation = 'slideOut 0.3s ease forwards';
            setTimeout(() => notification.remove(), 300);
        });

        // Auto-dismiss
        setTimeout(() => {
            if (notification.parentElement) {
                notification.style.animation = 'slideOut 0.3s ease forwards';
                setTimeout(() => notification.remove(), 300);
            }
        }, 5000);
    }

    // ==========================================
    // INTERSECTION OBSERVER FOR ANIMATIONS
    // ==========================================
    const animateOnScroll = () => {
        const elements = document.querySelectorAll('.feature-card, .testimonial-card, .pricing-card');

        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry, index) => {
                if (entry.isIntersecting) {
                    // Stagger animation
                    setTimeout(() => {
                        entry.target.style.opacity = '1';
                        entry.target.style.transform = 'translateY(0)';
                    }, index * 100);
                    observer.unobserve(entry.target);
                }
            });
        }, {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        });

        elements.forEach(el => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(30px)';
            el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
            observer.observe(el);
        });
    };

    // Run after a small delay to ensure elements are rendered
    setTimeout(animateOnScroll, 100);

    // ==========================================
    // STATS COUNTER ANIMATION
    // ==========================================
    const animateCounters = () => {
        const counters = document.querySelectorAll('.stat-value');

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const target = entry.target;
                    const text = target.textContent;
                    const match = text.match(/[\d.]+/);

                    if (match) {
                        const endValue = parseFloat(match[0].replace(',', ''));
                        const suffix = text.replace(/[\d.,]+/, '');
                        const duration = 2000;
                        const startTime = performance.now();

                        const animate = (currentTime) => {
                            const elapsed = currentTime - startTime;
                            const progress = Math.min(elapsed / duration, 1);

                            // Easing function
                            const easeOutQuart = 1 - Math.pow(1 - progress, 4);
                            const currentValue = easeOutQuart * endValue;

                            // Format based on original format
                            if (text.includes('K')) {
                                target.textContent = `${Math.floor(currentValue)}K${suffix.replace('K', '')}`;
                            } else if (text.includes('%')) {
                                target.textContent = `${currentValue.toFixed(1)}%`;
                            } else if (text.includes('+')) {
                                target.textContent = `${Math.floor(currentValue)}+`;
                            } else {
                                target.textContent = `${Math.floor(currentValue)}${suffix}`;
                            }

                            if (progress < 1) {
                                requestAnimationFrame(animate);
                            } else {
                                target.textContent = text; // Restore original
                            }
                        };

                        requestAnimationFrame(animate);
                    }

                    observer.unobserve(target);
                }
            });
        }, { threshold: 0.5 });

        counters.forEach(counter => observer.observe(counter));
    };

    animateCounters();

    // ==========================================
    // PARALLAX EFFECT FOR HERO (Desktop Only)
    // ==========================================
    if (window.innerWidth > 1024) {
        const dashboardPreview = document.querySelector('.dashboard-preview');
        const floatingCards = document.querySelectorAll('.floating-card');

        if (dashboardPreview) {
            window.addEventListener('mousemove', (e) => {
                const x = (e.clientX / window.innerWidth - 0.5) * 20;
                const y = (e.clientY / window.innerHeight - 0.5) * 20;

                dashboardPreview.style.transform = `rotateY(${-5 + x * 0.5}deg) rotateX(${2 + y * 0.3}deg)`;

                floatingCards.forEach((card, index) => {
                    const factor = (index + 1) * 0.3;
                    card.style.transform = `translateY(${Math.sin(Date.now() / 1000 + index) * 10}px) translateX(${x * factor}px)`;
                });
            });
        }
    }

    // ==========================================
    // RESIZE HANDLER
    // ==========================================
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            // Close mobile menu on resize to desktop
            if (window.innerWidth > 768 && mobileMenu) {
                mobileMenuBtn.classList.remove('active');
                mobileMenu.classList.remove('active');
                document.body.style.overflow = '';
            }
        }, 250);
    });

    // ==========================================
    // ACTIVE NAV LINK ON SCROLL
    // ==========================================
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav-links a');

    const updateActiveLink = () => {
        const scrollPosition = window.scrollY + 100;

        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.offsetHeight;
            const sectionId = section.getAttribute('id');

            if (scrollPosition >= sectionTop && scrollPosition < sectionTop + sectionHeight) {
                navLinks.forEach(link => {
                    link.classList.remove('active');
                    if (link.getAttribute('href') === `#${sectionId}`) {
                        link.classList.add('active');
                    }
                });
            }
        });
    };

    window.addEventListener('scroll', updateActiveLink);

    console.log('🚀 Sync Website loaded successfully!');
});

// ==========================================
// PRELOADER (Optional - add to HTML if needed)
// ==========================================
window.addEventListener('load', () => {
    const preloader = document.querySelector('.preloader');
    if (preloader) {
        preloader.style.opacity = '0';
        setTimeout(() => preloader.remove(), 300);
    }
});

// ==========================================
// DYNAMIC PRICING FUNCTIONS
// ==========================================

/**
 * Format price with thousands separator
 */
function formatPrice(amount) {
    if (amount === 0 || amount === 'Custom') return 'Custom';
    return new Intl.NumberFormat('en-ZM').format(amount);
}

/**
 * Get feature display name from feature key
 */
function getFeatureLabel(feature) {
    const labels = {
        'sms': 'SMS & WhatsApp Messages',
        'email': 'Email Notifications',
        'parent_portal': 'Parent Portal Access',
        'online_assessments': 'Online Assessments',
        'report_cards': 'Report Cards',
        'attendance': 'Digital Attendance',
        'fee_management': 'Fee Management',
        'chat': 'In-App Messaging',
        'advanced_reports': 'Advanced Analytics',
        'api_access': 'API Access',
        'timetable': 'Timetable Management',
        'syllabus': 'Syllabus Tracking',
        'ai_lesson_plan': 'AI Lesson Planning',
        'ai_tutor': 'AI Tutor for Students',
        'ai_analytics': 'AI Analytics',
        'ai_report_cards': 'AI Report Cards',
        'ai_assessments': 'AI Quiz Generation',
        'multi_branch': 'Multi-Campus Support',
        'custom_domain': 'Custom Domain',
        'priority_support': 'Priority Support',
        'dedicated_manager': 'Dedicated Account Manager',
        'onsite_training': 'On-site Training',
        'sla_uptime': '99.9% SLA Uptime'
    };
    return labels[feature] || feature.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

/**
 * Create pricing card HTML
 */
function createPricingCard(plan) {
    const isPopular = plan.isPopular;
    const isCustom = plan.price.monthly.zmw === 0 || plan.tier.toUpperCase() === 'ENTERPRISE';
    
    const priceHtml = isCustom 
        ? `<span class="currency"></span><span class="amount">Custom</span><span class="period"></span>`
        : `<span class="currency">ZMW</span><span class="amount">${formatPrice(plan.price.monthly.zmw)}</span><span class="period">/month</span>`;
    
    const studentLimit = plan.limits.students === 'Unlimited' || plan.limits.students === 0
        ? 'Unlimited students'
        : `Up to ${formatPrice(plan.limits.students)} students`;
    
    // Build features list
    let featuresHtml = `<li><span class="check">✓</span> ${studentLimit}</li>`;
    
    // Add key features from the features array
    const featuresArray = plan.features || [];
    featuresArray.slice(0, 6).forEach(feature => {
        const label = getFeatureLabel(feature);
        const isAiFeature = feature.startsWith('ai_');
        featuresHtml += `<li><span class="check">✓</span> ${isAiFeature ? `<strong>${label}</strong>` : label}</li>`;
    });
    
    const buttonClass = isPopular ? 'btn btn-primary btn-block' : 'btn btn-outline btn-block';
    const buttonText = isCustom ? 'Contact Sales' : 'Get Started';
    
    return `
        <div class="pricing-card ${isPopular ? 'popular' : ''}">
            ${isPopular ? '<div class="popular-badge">Most Popular</div>' : ''}
            <div class="pricing-header">
                <h3>${plan.name}</h3>
                <p>${plan.description || ''}</p>
            </div>
            <div class="pricing-price">
                ${priceHtml}
            </div>
            <ul class="pricing-features">
                ${featuresHtml}
            </ul>
            <a href="#contact" class="${buttonClass}">${buttonText}</a>
        </div>
    `;
}

/**
 * Load pricing from API
 */
async function loadPricing() {
    const pricingGrid = document.getElementById('pricing-grid');
    const pricingLoading = document.getElementById('pricing-loading');
    const pricingFallback = document.getElementById('pricing-fallback');
    
    if (!pricingGrid) return;
    
    try {
        const response = await fetch(`${API_BASE_URL}/website/pricing`);
        
        if (!response.ok) {
            throw new Error('Failed to fetch pricing');
        }
        
        const data = await response.json();
        
        if (data.success && data.plans && data.plans.length > 0) {
            // Hide loading
            if (pricingLoading) pricingLoading.style.display = 'none';
            
            // Render pricing cards
            const cardsHtml = data.plans.map(plan => createPricingCard(plan)).join('');
            pricingGrid.innerHTML = cardsHtml;
            
            console.log('✅ Pricing loaded from API');
        } else {
            throw new Error('No pricing plans available');
        }
    } catch (error) {
        console.warn('⚠️ Could not load pricing from API, using fallback:', error.message);
        
        // Hide loading and show fallback
        if (pricingLoading) pricingLoading.style.display = 'none';
        if (pricingGrid) pricingGrid.style.display = 'none';
        if (pricingFallback) pricingFallback.style.display = '';
    }
}
