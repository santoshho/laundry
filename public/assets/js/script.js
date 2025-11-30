// ===========================================
// Custom JavaScript for Laundry Management System
// ===========================================


// ===================
// Form validation
// ===================
function submitFormWithValidation(formId) {
    const form = document.getElementById(formId);
    if (!form) return false;

    let isValid = true;
    const inputs = form.querySelectorAll('input[required], select[required], textarea[required]');

    inputs.forEach(input => {
        if (!input.value.trim()) {
            input.classList.add('is-invalid');
            isValid = false;
        } else {
            input.classList.remove('is-invalid');
            input.classList.add('is-valid');
        }
    });

    // Email validation
    const emailInputs = form.querySelectorAll('input[type="email"]');
    emailInputs.forEach(input => {
        if (input.value && !isValidEmail(input.value)) {
            input.classList.add('is-invalid');
            isValid = false;
        }
    });

    // Phone validation
    const phoneInputs = form.querySelectorAll('input[type="tel"]');
    phoneInputs.forEach(input => {
        if (input.value && !isValidPhone(input.value)) {
            input.classList.add('is-invalid');
            isValid = false;
        }
    });

    return isValid;
}


// Email validation
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Phone validation
function isValidPhone(phone) {
    const phoneRegex = /^[0-9+\-\s()]+$/;
    return phoneRegex.test(phone) && phone.replace(/\D/g, '').length >= 10;
}


// =======================
// Auto-hide alerts
// =======================
document.addEventListener('DOMContentLoaded', function() {
    const alerts = document.querySelectorAll('.alert:not(.alert-permanent)');
    alerts.forEach(alert => {
        setTimeout(() => {
            alert.style.transition = 'opacity 0.5s ease';
            alert.style.opacity = '0';
            setTimeout(() => {
                if (alert.parentNode) alert.parentNode.removeChild(alert);
            }, 500);
        }, 5000);
    });
});


// Confirm delete
function confirmDelete(message = 'Are you sure you want to delete this item?') {
    return confirm(message);
}


// Currency formatting
function formatCurrency(amount) {
    return '$' + parseFloat(amount).toFixed(2);
}


// ========================
// Calculate total cost
// ========================
function calculateTotal() {
    const weightInput = document.getElementById('weight');
    const serviceSelect = document.getElementById('service_type');
    const totalElement = document.getElementById('total_cost');

    if (!weightInput || !serviceSelect || !totalElement) return;

    const weight = parseFloat(weightInput.value) || 0;
    const selectedOption = serviceSelect.options[serviceSelect.selectedIndex];
    const pricePerKg = parseFloat(selectedOption.dataset.price) || 0;

    const total = weight * pricePerKg;
    totalElement.textContent = formatCurrency(total);
}


// ==========================
// Real-time validation
// ==========================
document.addEventListener('DOMContentLoaded', function() {
    const forms = document.querySelectorAll('form');

    forms.forEach(form => {
        const inputs = form.querySelectorAll('input, select, textarea');

        inputs.forEach(input => {
            input.addEventListener('blur', function() {
                validateField(this);
            });

            input.addEventListener('input', function() {
                if (this.classList.contains('is-invalid')) {
                    validateField(this);
                }
            });
        });
    });
});


// Validate field
function validateField(field) {
    const value = field.value.trim();
    let isValid = true;

    if (field.hasAttribute('required') && !value) {
        isValid = false;
    }

    if (field.type === 'email' && value && !isValidEmail(value)) {
        isValid = false;
    }

    if (field.type === 'tel' && value && !isValidPhone(value)) {
        isValid = false;
    }

    if (field.name === 'confirm_password') {
        const passwordField = document.querySelector('input[name="password"]');
        if (passwordField && value !== passwordField.value) {
            isValid = false;
        }
    }

    if (isValid) {
        field.classList.remove('is-invalid');
        field.classList.add('is-valid');
    } else {
        field.classList.remove('is-valid');
        field.classList.add('is-invalid');
    }

    return isValid;
}


// ===========================
// File upload preview
// ===========================
function previewFile(input, previewId) {
    const file = input.files[0];
    const preview = document.getElementById(previewId);

    if (!file || !preview) return;

    const reader = new FileReader();

    reader.onload = function(e) {
        if (file.type.startsWith('image/')) {
            preview.innerHTML =
                `<img src="${e.target.result}" class="img-fluid rounded" style="max-height: 200px;">`;
        } else {
            preview.innerHTML =
                `<div class="alert alert-info"><i class="bi bi-file-earmark"></i> ${file.name}</div>`;
        }
    };

    reader.readAsDataURL(file);
}


// ===========================
// Loading button
// ===========================
function setLoadingState(button, loading = true) {
    if (loading) {
        button.disabled = true;
        button.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Loading...';
    } else {
        button.disabled = false;
        button.innerHTML = button.dataset.originalText || 'Submit';
    }
}


// Bootstrap tooltips
document.addEventListener('DOMContentLoaded', function() {
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map(function(el) {
        return new bootstrap.Tooltip(el);
    });
});

// Bootstrap popovers
document.addEventListener('DOMContentLoaded', function() {
    const popoverTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="popover"]'));
    popoverTriggerList.map(function(el) {
        return new bootstrap.Popover(el);
    });
});


// ============================
// Notifications auto-refresh
// ============================
function refreshNotifications() {
    fetch('notifications.php?ajax=1')
        .then(response => response.json())
        .then(data => {
            const badge = document.querySelector('.notification-badge');
            if (badge && data.unread_count !== undefined) {
                badge.textContent = data.unread_count;
                badge.style.display = data.unread_count > 0 ? 'inline' : 'none';
            }
        })
        .catch(err => console.log('Notification refresh failed:', err));
}

setInterval(refreshNotifications, 30000);


// ============================
// Print page
// ============================
function printPage() {
    window.print();
}


// ============================
// Export table → CSV
// ============================
function exportToCSV(tableId, filename = 'export.csv') {
    const table = document.getElementById(tableId);
    if (!table) return;

    let csv = [];
    const rows = table.querySelectorAll('tr');

    rows.forEach(row => {
        const cols = row.querySelectorAll('td, th');
        const rowData = [];
        cols.forEach(col => {
            rowData.push('"' + col.textContent.trim().replace(/"/g, '""') + '"');
        });
        csv.push(rowData.join(','));
    });

    const csvContent = csv.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();

    window.URL.revokeObjectURL(url);
}


// ============================
// Search Table Filter
// ============================
function searchTable(inputId, tableId) {
    const input = document.getElementById(inputId);
    const table = document.getElementById(tableId);

    if (!input || !table) return;

    input.addEventListener('keyup', function() {
        const filter = this.value.toLowerCase();
        const rows = table.querySelectorAll('tbody tr');

        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(filter) ? '' : 'none';
        });
    });
}



// =====================================================
//           EXTRA FEATURES YOU REQUESTED
// =====================================================


// 🔥 1) Random Promo Popup
function showRandomPopup() {
    const popup = document.createElement('div');
    popup.className = 'random-popup';
    popup.innerHTML = `
        <div class="popup-box">
            <h5>🔥 Special Offer 🔥</h5>
            <p>Get 20% off on your next wash when you refer a friend!</p>
            <button class="btn btn-primary btn-sm" id="popupClose">OK</button>
        </div>
    `;

    document.body.appendChild(popup);

    setTimeout(() => popup.classList.add('show'), 100);

    document.getElementById('popupClose').addEventListener('click', () => {
        popup.classList.remove('show');
        setTimeout(() => popup.remove(), 300);
    });
}


// 🔵 2) Floating Bubbles (Hero Section)
function createBubbles() {
    const hero = document.querySelector('.hero-section');
    if (!hero) return;

    const container = document.createElement('div');
    container.className = 'bubble-container';
    hero.appendChild(container);

    for (let i = 0; i < 20; i++) {
        const bubble = document.createElement('span');
        bubble.className = 'bubble';

        bubble.style.left = Math.random() * 100 + '%';
        bubble.style.width = bubble.style.height = 10 + Math.random() * 20 + 'px';
        bubble.style.animationDuration = 4 + Math.random() * 6 + 's';
        bubble.style.animationDelay = Math.random() * 5 + 's';

        container.appendChild(bubble);
    }
}


// Run extra features after page load
document.addEventListener('DOMContentLoaded', () => {

    // random popup 40% chance
    if (Math.random() >= 0.6) {
        setTimeout(showRandomPopup, 2500);
    }

    // create bubbles
    createBubbles();
});
