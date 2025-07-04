// /public/js/authService.js
class AuthService {
  constructor() {
    this.token = localStorage.getItem('traffictools_auth_token');
    this.user = JSON.parse(localStorage.getItem('traffictools_user') || 'null');
    this.baseUrl = window.location.origin; // Automatically detect base URL
    this.refreshPromise = null;
    this.authCheckInterval = null;
    
    // Start periodic auth check
    this.startAuthCheck();
  }

  // Check if user is authenticated
  isAuthenticated() {
    return !!this.token && !!this.user;
  }

  // Get current user
  getCurrentUser() {
    return this.user;
  }

  // Get current token
  getToken() {
    return this.token;
  }

  // Start periodic authentication check
  startAuthCheck() {
    // Check authentication every 5 minutes
    this.authCheckInterval = setInterval(() => {
      if (this.isAuthenticated()) {
        this.verifyToken().catch(error => {
          console.error('Periodic auth check failed:', error);
          this.showLoginModal();
        });
      }
    }, 5 * 60 * 1000);
  }

  // Stop periodic authentication check
  stopAuthCheck() {
    if (this.authCheckInterval) {
      clearInterval(this.authCheckInterval);
      this.authCheckInterval = null;
    }
  }

  // Login method
  async login(username, password) {
    try {
      const response = await fetch(`${this.baseUrl}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Login failed');
      }

      // Store token and user data
      this.token = data.token;
      this.user = data.user;
      localStorage.setItem('traffictools_auth_token', this.token);
      localStorage.setItem('traffictools_user', JSON.stringify(this.user));

      // Hide login modal after successful login
      this.hideLoginModal();
      
      // Show success message
      this.showNotification(`Welcome back, ${this.user.username}!`, 'success');

      return data;
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  }

  // Logout method
  async logout() {
    try {
      if (this.token) {
        // Call logout endpoint
        await fetch(`${this.baseUrl}/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json'
          }
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Clear local storage regardless of API call success
      this.token = null;
      this.user = null;
      localStorage.removeItem('traffictools_auth_token');
      localStorage.removeItem('traffictools_user');
      this.refreshPromise = null;
      
      // Stop auth check
      this.stopAuthCheck();
      
      // Show login modal
      this.showLoginModal();
      
      // Show logout message
      this.showNotification('You have been logged out.', 'info');
    }
  }

  // Refresh token
  async refreshToken() {
    // Prevent multiple simultaneous refresh attempts
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this._performRefresh();
    
    try {
      const result = await this.refreshPromise;
      return result;
    } finally {
      this.refreshPromise = null;
    }
  }

  async _performRefresh() {
    try {
      const response = await fetch(`${this.baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Token refresh failed');
      }

      const data = await response.json();
      this.token = data.token;
      localStorage.setItem('traffictools_auth_token', this.token);

      return data;
    } catch (error) {
      console.error('Token refresh error:', error);
      // If refresh fails, logout user
      await this.logout();
      throw error;
    }
  }

  // Make authenticated request with automatic token refresh
  async makeAuthenticatedRequest(url, options = {}) {
    if (!this.token) {
      this.showLoginModal();
      throw new Error('No authentication token available');
    }

    const makeRequest = async (token) => {
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers
      };

      return fetch(url, {
        ...options,
        headers
      });
    };

    try {
      // Try with current token
      let response = await makeRequest(this.token);

      // If unauthorized, try to refresh token and retry once
      if (response.status === 401 || response.status === 403) {
        console.log('Token expired, attempting refresh...');
        
        try {
          await this.refreshToken();
          response = await makeRequest(this.token);
        } catch (refreshError) {
          // Refresh failed, user needs to login again
          this.showLoginModal();
          throw new Error('Authentication required');
        }
      }

      return response;
    } catch (error) {
      console.error('Authenticated request error:', error);
      throw error;
    }
  }

  // Verify token validity
  async verifyToken() {
    if (!this.token) {
      return false;
    }

    try {
      const response = await fetch(`${this.baseUrl}/auth/verify`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        // Update user data if verification successful
        this.user = data.user;
        localStorage.setItem('traffictools_user', JSON.stringify(this.user));
        return true;
      } else {
        // Token is invalid
        await this.logout();
        return false;
      }
    } catch (error) {
      console.error('Token verification error:', error);
      await this.logout();
      return false;
    }
  }

  // Show login modal
  showLoginModal() {
    const modal = document.getElementById('authModal');
    if (modal) {
      modal.style.display = 'block';
      // Clear any previous error messages
      const errorDiv = document.getElementById('authError');
      if (errorDiv) {
        errorDiv.style.display = 'none';
      }
    }
  }

  // Hide login modal
  hideLoginModal() {
    const modal = document.getElementById('authModal');
    if (modal) {
      modal.style.display = 'none';
      // Clear form
      const form = document.getElementById('authForm');
      if (form) {
        form.reset();
      }
    }
  }

  // Show notification
  showNotification(message, type = 'info') {
    // Create notification element if it doesn't exist
    let notification = document.getElementById('authNotification');
    if (!notification) {
      notification = document.createElement('div');
      notification.id = 'authNotification';
      notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        border-radius: 4px;
        color: white;
        font-weight: bold;
        z-index: 10000;
        min-width: 250px;
        text-align: center;
        transition: opacity 0.3s ease;
      `;
      document.body.appendChild(notification);
    }

    // Set color based on type
    const colors = {
      success: '#28a745',
      error: '#dc3545',
      warning: '#ffc107',
      info: '#17a2b8'
    };
    
    notification.style.backgroundColor = colors[type] || colors.info;
    notification.textContent = message;
    notification.style.display = 'block';
    notification.style.opacity = '1';

    // Auto hide after 4 seconds
    setTimeout(() => {
      if (notification) {
        notification.style.opacity = '0';
        setTimeout(() => {
          if (notification && notification.parentNode) {
            notification.style.display = 'none';
          }
        }, 300);
      }
    }, 4000);
  }

  // Check authentication on page load
  async checkAuthOnLoad() {
    if (!this.isAuthenticated()) {
      this.showLoginModal();
      return false;
    }

    try {
      const isValid = await this.verifyToken();
      if (!isValid) {
        this.showLoginModal();
        this.showNotification('Your session has expired. Please login again.', 'warning');
        return false;
      }
      
      // Update user display if exists
      this.updateUserDisplay();
      return true;
    } catch (error) {
      console.error('Auth verification error:', error);
      this.showLoginModal();
      this.showNotification('Unable to verify authentication. Please login.', 'error');
      return false;
    }
  }

  // Update user display elements
  updateUserDisplay() {
    const userElements = document.querySelectorAll('.auth-username');
    userElements.forEach(element => {
      if (this.user) {
        element.textContent = this.user.username;
      }
    });
  }

  // Handle form submission
  async handleLoginSubmit(event) {
    event.preventDefault();
    
    const username = document.getElementById('authUsername').value.trim();
    const password = document.getElementById('authPassword').value;
    const errorDiv = document.getElementById('authError');
    const submitBtn = document.getElementById('authSubmit');

    if (!username || !password) {
      this.showAuthError('Please enter both username and password');
      return;
    }

    // Show loading state
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Logging in...';
    }

    try {
      await this.login(username, password);
      // Login successful - modal will be hidden by login method
    } catch (error) {
      this.showAuthError(error.message || 'Login failed. Please check your credentials.');
    } finally {
      // Reset button state
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Login';
      }
    }
  }

  // Show authentication error
  showAuthError(message) {
    const errorDiv = document.getElementById('authError');
    if (errorDiv) {
      errorDiv.textContent = message;
      errorDiv.style.display = 'block';
    }
  }

  // Initialize event listeners
  initializeEventListeners() {
    // Login form submission
    const authForm = document.getElementById('authForm');
    if (authForm) {
      authForm.addEventListener('submit', (e) => this.handleLoginSubmit(e));
    }

    // Logout button
    const logoutButtons = document.querySelectorAll('.auth-logout');
    logoutButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        e.preventDefault();
        this.logout();
      });
    });

    // Close modal when clicking outside
    window.addEventListener('click', (event) => {
      const modal = document.getElementById('authModal');
      if (event.target === modal) {
        // Don't allow closing modal by clicking outside if not authenticated
        if (this.isAuthenticated()) {
          this.hideLoginModal();
        }
      }
    });
  }
}

// Create singleton instance
window.authService = new AuthService();