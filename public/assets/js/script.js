// Custom JavaScript for Laundry Management System

// Form validation function
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

// Auto-hide alerts
document.addEventListener('DOMContentLoaded', function() {
    const alerts = document.querySelectorAll('.alert:not(.alert-permanent)');
    alerts.forEach(alert => {
        setTimeout(() => {
            alert.style.transition = 'opacity 0.5s ease';
            alert.style.opacity = '0';
            setTimeout(() => {
                if (alert.parentNode) {
                    alert.parentNode.removeChild(alert);
                }
            }, 500);
        }, 5000);
    });
});

// Confirm delete actions
function confirmDelete(message = 'Are you sure you want to delete this item?') {
    return confirm(message);
}

// Format currency
function formatCurrency(amount) {
    return '$' + parseFloat(amount).toFixed(2);
}

// Calculate total cost
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

// Real-time form validation
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

// Validate individual field
function validateField(field) {
    const value = field.value.trim();
    let isValid = true;
    
    // Required field validation
    if (field.hasAttribute('required') && !value) {
        isValid = false;
    }
    
    // Email validation
    if (field.type === 'email' && value && !isValidEmail(value)) {
        isValid = false;
    }
    
    // Phone validation
    if (field.type === 'tel' && value && !isValidPhone(value)) {
        isValid = false;
    }
    
    // Password confirmation
    if (field.name === 'confirm_password') {
        const passwordField = document.querySelector('input[name="password"]');
        if (passwordField && value !== passwordField.value) {
            isValid = false;
        }
    }
    
    // Update field appearance
    if (isValid) {
        field.classList.remove('is-invalid');
        field.classList.add('is-valid');
    } else {
        field.classList.remove('is-valid');
        field.classList.add('is-invalid');
    }
    
    return isValid;
}

// File upload preview
function previewFile(input, previewId) {
    const file = input.files[0];
    const preview = document.getElementById(previewId);
    
    if (!file || !preview) return;
    
    const reader = new FileReader();
    
    reader.onload = function(e) {
        if (file.type.startsWith('image/')) {
            preview.innerHTML = `<img src="${e.target.result}" class="img-fluid rounded" style="max-height: 200px;">`;
        } else {
            preview.innerHTML = `<div class="alert alert-info"><i class="bi bi-file-earmark"></i> ${file.name}</div>`;
        }
    };
    
    reader.readAsDataURL(file);
}

// Loading button state
function setLoadingState(button, loading = true) {
    if (loading) {
        button.disabled = true;
        button.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Loading...';
    } else {
        button.disabled = false;
        button.innerHTML = button.dataset.originalText || 'Submit';
    }
}

// Initialize tooltips
document.addEventListener('DOMContentLoaded', function() {
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map(function(tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });
});

// Initialize popovers
document.addEventListener('DOMContentLoaded', function() {
    const popoverTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="popover"]'));
    popoverTriggerList.map(function(popoverTriggerEl) {
        return new bootstrap.Popover(popoverTriggerEl);
    });
});

// Auto-refresh notifications
function refreshNotifications() {
    fetch('notifications.php?ajax=1')
        .then(response => response.json())
        .then(data => {
            const badge = document.querySelector('.notification-badge');
            if (badge && data.unread_count) {
                badge.textContent = data.unread_count;
                badge.style.display = data.unread_count > 0 ? 'inline' : 'none';
            }
        })
        .catch(error => console.log('Notification refresh failed:', error));
}

// Refresh notifications every 30 seconds
setInterval(refreshNotifications, 30000);

// Print functionality
function printPage() {
    window.print();
}

// Export to CSV (basic implementation)
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

// Search functionality
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

// Notification Toast System
function showNotification(message, type = 'success', title = null) {
    const toastElement = document.getElementById('notificationToast');
    const toastIcon = document.getElementById('toastIcon');
    const toastTitle = document.getElementById('toastTitle');
    const toastMessage = document.getElementById('toastMessage');
    
    if (!toastElement) return;
    
    // Set icon and color based on type
    const typeConfig = {
        'success': { icon: 'bi-check-circle-fill', color: 'text-success' },
        'error': { icon: 'bi-x-circle-fill', color: 'text-danger' },
        'warning': { icon: 'bi-exclamation-triangle-fill', color: 'text-warning' },
        'info': { icon: 'bi-info-circle-fill', color: 'text-info' }
    };
    
    const config = typeConfig[type] || typeConfig['info'];
    
    // Set icon with appropriate color
    if (type === 'success') {
        toastIcon.className = 'bi bi-check-circle-fill me-2 text-white';
    } else if (type === 'error') {
        toastIcon.className = 'bi bi-x-circle-fill me-2 text-white';
    } else if (type === 'warning') {
        toastIcon.className = 'bi bi-exclamation-triangle-fill me-2 text-dark';
    } else {
        toastIcon.className = 'bi bi-info-circle-fill me-2 text-white';
    }
    
    // Set title
    if (title) {
        toastTitle.textContent = title;
    } else {
        toastTitle.textContent = type.charAt(0).toUpperCase() + type.slice(1);
    }
    
    // Set message
    toastMessage.textContent = message;
    
    // Remove existing classes
    toastElement.classList.remove('bg-success', 'bg-danger', 'bg-warning', 'bg-info', 'text-white', 'text-dark');
    const toastHeader = toastElement.querySelector('.toast-header');
    if (toastHeader) {
        toastHeader.classList.remove('bg-success', 'bg-danger', 'bg-warning', 'bg-info', 'text-white', 'text-dark');
    }
    
    // Add background color class
    if (type === 'success') {
        toastElement.classList.add('bg-success', 'text-white');
        if (toastHeader) {
            toastHeader.classList.add('bg-success', 'text-white');
        }
    } else if (type === 'error') {
        toastElement.classList.add('bg-danger', 'text-white');
        if (toastHeader) {
            toastHeader.classList.add('bg-danger', 'text-white');
        }
    } else if (type === 'warning') {
        toastElement.classList.add('bg-warning', 'text-dark');
        if (toastHeader) {
            toastHeader.classList.add('bg-warning', 'text-dark');
        }
    } else {
        toastElement.classList.add('bg-info', 'text-white');
        if (toastHeader) {
            toastHeader.classList.add('bg-info', 'text-white');
        }
    }
    
    // Show the toast
    const toast = new bootstrap.Toast(toastElement, {
        autohide: true,
        delay: 5000
    });
    toast.show();
}

// Store last checked notification IDs to avoid duplicates
let lastNotificationIds = new Set();

// Update notification badge count
function updateNotificationBadge(count) {
    const badge = document.getElementById('notificationBadge');
    if (badge) {
        if (count > 0) {
            badge.textContent = count;
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }
    }
}

// Check for new notifications from API
async function checkNotifications() {
    try {
        console.log('Checking for notifications...');
        const response = await fetch('/api/notifications');
        const data = await response.json();
        console.log('Notifications API response:', data);
        
        if (data.notifications && data.notifications.length > 0) {
            // Update badge count
            updateNotificationBadge(data.notifications.length);
            console.log('Found', data.notifications.length, 'unread notifications');
            
            // Show only new notifications (not already shown)
            data.notifications.forEach(notification => {
                if (!lastNotificationIds.has(notification.id)) {
                    console.log('Showing new notification:', notification);
                    showNotification(
                        notification.message, 
                        notification.type || 'info',
                        notification.title || 'Notification'
                    );
                    lastNotificationIds.add(notification.id);
                    
                    // Mark as read after showing
                    setTimeout(() => {
                        fetch(`/api/notifications/${notification.id}/read`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            }
                        }).then(() => {
                            console.log('Notification marked as read:', notification.id);
                            // Update badge count after marking as read
                            checkNotifications();
                        }).catch(err => console.log('Failed to mark notification as read:', err));
                    }, 1000);
                }
            });
        } else {
            // No notifications, hide badge
            updateNotificationBadge(0);
            console.log('No unread notifications');
        }
    } catch (error) {
        // Log error for debugging
        console.log('Notification check failed:', error);
    }
}

// Check for notification in URL parameters or data attributes
document.addEventListener('DOMContentLoaded', function() {
    // Check URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const notificationMessage = urlParams.get('notification');
    const notificationType = urlParams.get('type') || 'success';
    
    if (notificationMessage) {
        showNotification(decodeURIComponent(notificationMessage), notificationType);
        // Clean URL
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
    }
    
    // Check for notification in data attribute (from server-side rendering)
    const notificationData = document.body.dataset.notification;
    const notificationDataType = document.body.dataset.notificationType || 'success';
    
    if (notificationData) {
        showNotification(notificationData, notificationDataType);
    }
    
    // Poll for notifications every 5 seconds (only if user is logged in)
    // Check if there's a user session by checking for user-specific elements
    const hasUserSession = document.body.querySelector('[data-user]') || 
                          window.location.pathname.startsWith('/admin') ||
                          window.location.pathname.startsWith('/user') ||
                          document.body.querySelector('.navbar-nav .nav-link[href*="dashboard"]');
    
    if (hasUserSession) {
        console.log('User session detected, starting notification polling');
        // Initial check after 2 seconds
        setTimeout(checkNotifications, 2000);
        
        // Then check every 5 seconds
        setInterval(checkNotifications, 5000);
    } else {
        console.log('No user session detected, skipping notification polling');
    }
});