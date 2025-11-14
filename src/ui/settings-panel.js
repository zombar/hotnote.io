/**
 * Settings Panel
 * GitHub-inspired settings UI for configuring AI provider settings
 */

import { getSettings, updateSettings, validateEndpointUrl } from '../state/settings-manager.js';
import { getAvailableProviders, getModelsForProvider } from '../services/ai-service.js';
import { isLocalEnvironment } from '../utils/environment.js';

export class SettingsPanel {
  constructor(options = {}) {
    this.panel = null;
    this.overlay = null;
    this.isOpen = false;
    this.getEditor = options.getEditor || null;
  }

  /**
   * Create the settings panel DOM structure
   */
  create() {
    // Create overlay
    this.overlay = document.createElement('div');
    this.overlay.className = 'settings-overlay';
    this.overlay.addEventListener('click', () => this.close());

    // Create panel
    this.panel = document.createElement('div');
    this.panel.className = 'settings-panel';
    this.panel.addEventListener('click', (e) => e.stopPropagation());

    // Header
    const header = document.createElement('div');
    header.className = 'settings-header';

    const title = document.createElement('h2');
    title.textContent = 'Settings';

    const closeButton = document.createElement('button');
    closeButton.className = 'settings-close-button';
    closeButton.innerHTML = '&times;';
    closeButton.setAttribute('aria-label', 'Close settings');
    closeButton.addEventListener('click', () => this.close());

    header.appendChild(title);
    header.appendChild(closeButton);

    // Privacy info banner
    const infoBanner = document.createElement('div');
    infoBanner.className = 'settings-info-banner';

    const infoIcon = document.createElement('span');
    infoIcon.className = 'settings-info-icon';
    infoIcon.innerHTML = '🔒';

    const infoText = document.createElement('div');
    infoText.className = 'settings-info-text';

    const infoTitle = document.createElement('strong');
    infoTitle.textContent = 'Local-First & Private';

    const infoDescription = document.createElement('p');
    infoDescription.textContent =
      'Hotnote is local-first. Your data never leaves your device, and we will never attempt to collect or access your information.';

    const infoLink = document.createElement('p');
    infoLink.className = 'settings-info-link';
    const sourceLink = document.createElement('a');
    sourceLink.href = 'https://github.com/zombar/hotnote.io';
    sourceLink.target = '_blank';
    sourceLink.rel = 'noopener noreferrer';
    sourceLink.textContent = 'source code';
    sourceLink.setAttribute('data-testid', 'settings-source-code-link');
    infoLink.appendChild(sourceLink);

    infoText.appendChild(infoTitle);
    infoText.appendChild(infoDescription);
    infoText.appendChild(infoLink);

    infoBanner.appendChild(infoIcon);
    infoBanner.appendChild(infoText);

    // Content
    const content = document.createElement('div');
    content.className = 'settings-content';

    // Create form
    const form = this.createForm();
    content.appendChild(form);

    // Footer
    const footer = document.createElement('div');
    footer.className = 'settings-footer';

    const saveButton = document.createElement('button');
    saveButton.className = 'settings-save-button';
    saveButton.textContent = 'Save';
    saveButton.setAttribute('data-testid', 'settings-save-button');
    saveButton.addEventListener('click', () => this.save());

    const cancelButton = document.createElement('button');
    cancelButton.className = 'settings-cancel-button';
    cancelButton.textContent = 'Cancel';
    cancelButton.addEventListener('click', () => this.close());

    footer.appendChild(cancelButton);
    footer.appendChild(saveButton);

    // Assemble panel
    this.panel.appendChild(header);

    // Only show privacy banner when hosted (not running locally)
    // This emphasizes the local-first, privacy-preserving nature of Hotnote
    if (!isLocalEnvironment()) {
      this.panel.appendChild(infoBanner);
    }

    this.panel.appendChild(content);
    this.panel.appendChild(footer);

    return this;
  }

  /**
   * Create settings form
   */
  createForm() {
    const settings = getSettings();
    const availableProviders = getAvailableProviders();

    // Determine the actual provider to use:
    // - Use saved provider if it's available in current environment
    // - Otherwise use the first available provider
    let currentProvider = settings.provider || 'claude';
    const providerAvailable = availableProviders.some((p) => p.value === currentProvider);
    if (!providerAvailable && availableProviders.length > 0) {
      currentProvider = availableProviders[0].value;
    }

    const form = document.createElement('form');
    form.className = 'settings-form';
    form.setAttribute('data-testid', 'settings-form');

    // Provider Selection Section
    const providerSection = this.createSection('AI Provider');

    // Provider dropdown
    const providerGroup = this.createProviderSelector('provider', 'Provider', currentProvider);
    providerSection.appendChild(providerGroup);

    form.appendChild(providerSection);

    // API Configuration Section (dynamic based on provider)
    const configSection = this.createSection('Configuration');
    configSection.id = 'config-section';

    // Add provider-specific fields using the actual current provider
    this.addProviderFields(configSection, currentProvider, settings);

    form.appendChild(configSection);

    // Model Settings Section
    const modelSection = this.createSection('Model Settings');

    // System Prompt - use the actual current provider
    const promptGroup = this.createFormGroup(
      'systemPrompt',
      'System Prompt',
      'textarea',
      settings[currentProvider]?.systemPrompt || '',
      ''
    );
    modelSection.appendChild(promptGroup);

    form.appendChild(modelSection);

    return form;
  }

  /**
   * Get current system prompt based on selected provider
   * @deprecated - no longer used, kept for backward compatibility
   */
  getCurrentSystemPrompt(settings) {
    const provider = settings.provider || 'claude';
    return settings[provider]?.systemPrompt || '';
  }

  /**
   * Create provider selector dropdown
   */
  createProviderSelector(name, label, value) {
    const group = document.createElement('div');
    group.className = 'settings-form-group';

    const labelEl = document.createElement('label');
    labelEl.className = 'settings-label';
    labelEl.textContent = label;
    labelEl.setAttribute('for', `settings-${name}`);

    const select = document.createElement('select');
    select.id = `settings-${name}`;
    select.name = name;
    select.className = 'settings-input settings-select';
    select.setAttribute('data-testid', `settings-${name}`);

    // Add provider options
    const providers = getAvailableProviders();
    providers.forEach((provider) => {
      const option = document.createElement('option');
      option.value = provider.value;
      option.textContent = provider.label;
      if (provider.value === value) {
        option.selected = true;
      }
      select.appendChild(option);
    });

    // Add change handler to update form
    select.addEventListener('change', (e) => {
      this.onProviderChange(e.target.value);
    });

    group.appendChild(labelEl);
    group.appendChild(select);

    return group;
  }

  /**
   * Handle provider change
   */
  onProviderChange(provider) {
    const settings = getSettings();
    const configSection = this.panel.querySelector('#config-section');

    // Clear existing fields
    const fieldsContainer = configSection.querySelector('.provider-fields');
    if (fieldsContainer) {
      fieldsContainer.remove();
    }

    // Add new provider-specific fields
    this.addProviderFields(configSection, provider, settings);

    // Update system prompt
    const systemPromptInput = this.panel.querySelector('textarea[name="systemPrompt"]');
    if (systemPromptInput) {
      systemPromptInput.value = settings[provider]?.systemPrompt || '';
    }
  }

  /**
   * Add provider-specific fields
   */
  addProviderFields(container, provider, settings) {
    const fieldsContainer = document.createElement('div');
    fieldsContainer.className = 'provider-fields';

    if (provider === 'ollama') {
      // Ollama endpoint
      const endpointGroup = this.createFormGroup(
        'endpoint',
        'Endpoint URL',
        'text',
        settings.ollama?.endpoint || 'http://localhost:11434',
        'http://localhost:11434'
      );
      fieldsContainer.appendChild(endpointGroup);

      // Add help text
      const helpText = document.createElement('p');
      helpText.className = 'settings-help-text';
      helpText.textContent = 'Enter the URL of your local Ollama server';
      fieldsContainer.appendChild(helpText);
    } else {
      // API Key for OpenAI/Claude
      const apiKeyGroup = this.createAPIKeyInput(
        `apiKey-${provider}`,
        'API Key',
        settings.apiKeys?.[provider] || ''
      );
      fieldsContainer.appendChild(apiKeyGroup);

      // Add help text with link
      const helpText = document.createElement('p');
      helpText.className = 'settings-help-text';

      const link = document.createElement('a');
      link.target = '_blank';
      link.rel = 'noopener noreferrer';

      if (provider === 'openai') {
        link.href = 'https://platform.openai.com/api-keys';
        link.textContent = 'Get your OpenAI API key';
      } else if (provider === 'claude') {
        link.href = 'https://console.anthropic.com/settings/keys';
        link.textContent = 'Get your Anthropic API key';
      }

      helpText.appendChild(link);
      fieldsContainer.appendChild(helpText);
    }

    // Model field - text input for Ollama, dropdown for cloud providers
    let modelGroup;
    if (provider === 'ollama') {
      // Text input for Ollama (users may have custom models)
      modelGroup = this.createFormGroup(
        'model',
        'Model',
        'text',
        settings.ollama?.model || 'llama2',
        'llama2'
      );

      // Add help text with common models
      const modelHelpText = document.createElement('p');
      modelHelpText.className = 'settings-help-text';
      modelHelpText.textContent = 'Enter the model name (e.g., llama2, mistral, codellama)';
      fieldsContainer.appendChild(modelGroup);
      fieldsContainer.appendChild(modelHelpText);
    } else {
      // Dropdown for cloud providers (fixed model list)
      modelGroup = this.createModelSelector(
        'model',
        'Model',
        settings[provider]?.model || '',
        provider
      );
      fieldsContainer.appendChild(modelGroup);
    }

    container.appendChild(fieldsContainer);
  }

  /**
   * Create API key input with show/hide toggle
   */
  createAPIKeyInput(name, label, value) {
    const group = document.createElement('div');
    group.className = 'settings-form-group';

    const labelEl = document.createElement('label');
    labelEl.className = 'settings-label';
    labelEl.textContent = label;
    labelEl.setAttribute('for', `settings-${name}`);

    const inputContainer = document.createElement('div');
    inputContainer.className = 'settings-api-key-container';

    const input = document.createElement('input');
    input.type = 'password';
    input.id = `settings-${name}`;
    input.name = name;
    input.className = 'settings-input';
    input.value = value;
    input.setAttribute('data-testid', `settings-${name}`);
    input.placeholder = 'sk-...';

    const toggleButton = document.createElement('button');
    toggleButton.type = 'button';
    toggleButton.className = 'settings-api-key-toggle';
    toggleButton.textContent = 'Show';
    toggleButton.setAttribute('aria-label', 'Toggle API key visibility');

    toggleButton.addEventListener('click', () => {
      if (input.type === 'password') {
        input.type = 'text';
        toggleButton.textContent = 'Hide';
      } else {
        input.type = 'password';
        toggleButton.textContent = 'Show';
      }
    });

    inputContainer.appendChild(input);
    inputContainer.appendChild(toggleButton);

    group.appendChild(labelEl);
    group.appendChild(inputContainer);

    return group;
  }

  /**
   * Create model selector dropdown
   */
  createModelSelector(name, label, value, provider) {
    const group = document.createElement('div');
    group.className = 'settings-form-group';

    const labelEl = document.createElement('label');
    labelEl.className = 'settings-label';
    labelEl.textContent = label;
    labelEl.setAttribute('for', `settings-${name}`);

    const select = document.createElement('select');
    select.id = `settings-${name}`;
    select.name = name;
    select.className = 'settings-input settings-select';
    select.setAttribute('data-testid', `settings-${name}`);

    // Get models for the provider
    const models = getModelsForProvider(provider);
    models.forEach((model) => {
      const option = document.createElement('option');
      option.value = model.value;
      option.textContent = model.label;
      if (model.value === value) {
        option.selected = true;
      }
      select.appendChild(option);
    });

    group.appendChild(labelEl);
    group.appendChild(select);

    return group;
  }

  /**
   * Create a form section
   */
  createSection(title) {
    const section = document.createElement('div');
    section.className = 'settings-section';

    const sectionTitle = document.createElement('h3');
    sectionTitle.className = 'settings-section-title';
    sectionTitle.textContent = title;

    section.appendChild(sectionTitle);

    return section;
  }

  /**
   * Create a form group (label + input)
   */
  createFormGroup(name, label, type, value, placeholder, attrs = {}) {
    const group = document.createElement('div');
    group.className = 'settings-form-group';

    const labelEl = document.createElement('label');
    labelEl.className = 'settings-label';
    labelEl.textContent = label;
    labelEl.setAttribute('for', `settings-${name}`);

    let input;
    if (type === 'textarea') {
      input = document.createElement('textarea');
      input.rows = 4;
      input.value = value;
    } else {
      input = document.createElement('input');
      input.type = type;
      input.value = value;

      // Apply additional attributes (for range inputs)
      Object.keys(attrs).forEach((key) => {
        input.setAttribute(key, attrs[key]);
      });
    }

    input.id = `settings-${name}`;
    input.name = name;
    input.className = 'settings-input';
    input.setAttribute('data-testid', `settings-${name}`);

    if (placeholder) {
      input.placeholder = placeholder;
    }

    // Show current value for range inputs
    if (type === 'range') {
      const valueDisplay = document.createElement('span');
      valueDisplay.className = 'settings-range-value';
      valueDisplay.textContent = value;
      input.addEventListener('input', () => {
        valueDisplay.textContent = input.value;
      });

      group.appendChild(labelEl);
      group.appendChild(input);
      group.appendChild(valueDisplay);
    } else {
      group.appendChild(labelEl);
      group.appendChild(input);
    }

    // Add validation error element
    const errorEl = document.createElement('div');
    errorEl.className = 'settings-error';
    errorEl.id = `settings-${name}-error`;
    group.appendChild(errorEl);

    return group;
  }

  /**
   * Validate form data
   */
  validate(data) {
    const errors = {};

    // Validate based on provider
    if (data.provider === 'ollama') {
      // Validate endpoint URL
      if (!data.endpoint || !validateEndpointUrl(data.endpoint)) {
        errors.endpoint = 'Please enter a valid HTTP or HTTPS URL';
      }
    } else {
      // Validate API key for OpenAI/Claude
      const apiKeyField = `apiKey-${data.provider}`;
      if (!data[apiKeyField] || data[apiKeyField].trim() === '') {
        errors[apiKeyField] = 'API key is required';
      } else {
        // Validate API key format
        const apiKey = data[apiKeyField].trim();
        if (data.provider === 'openai' && !apiKey.startsWith('sk-')) {
          errors[apiKeyField] = 'OpenAI API key should start with "sk-"';
        } else if (data.provider === 'claude' && !apiKey.startsWith('sk-ant-')) {
          errors[apiKeyField] = 'Anthropic API key should start with "sk-ant-"';
        }
      }
    }

    // Validate model
    if (!data.model || data.model.trim() === '') {
      errors.model = 'Model is required';
    }

    return errors;
  }

  /**
   * Show validation errors
   */
  showErrors(errors) {
    // Clear all errors first
    const errorElements = this.panel.querySelectorAll('.settings-error');
    errorElements.forEach((el) => (el.textContent = ''));

    // Show new errors
    Object.keys(errors).forEach((field) => {
      const errorEl = this.panel.querySelector(`#settings-${field}-error`);
      if (errorEl) {
        errorEl.textContent = errors[field];
      }
    });
  }

  /**
   * Save settings
   */
  save() {
    const form = this.panel.querySelector('.settings-form');
    /* global FormData */
    const formData = new FormData(form);

    const provider = formData.get('provider');
    const data = {
      provider,
      endpoint: formData.get('endpoint'),
      model: formData.get('model'),
      systemPrompt: formData.get('systemPrompt'),
      [`apiKey-${provider}`]: formData.get(`apiKey-${provider}`),
    };

    // Validate
    const errors = this.validate(data);

    if (Object.keys(errors).length > 0) {
      this.showErrors(errors);
      return;
    }

    // Build settings update
    const settingsUpdate = {
      provider,
    };

    // Update provider-specific settings
    if (provider === 'ollama') {
      settingsUpdate.ollama = {
        endpoint: data.endpoint,
        model: data.model,
        systemPrompt: data.systemPrompt,
      };
    } else {
      // Update API key
      settingsUpdate.apiKeys = {
        [provider]: data[`apiKey-${provider}`],
      };

      // Update provider settings
      settingsUpdate[provider] = {
        model: data.model,
        systemPrompt: data.systemPrompt,
      };
    }

    // Update settings
    updateSettings(settingsUpdate);

    this.close();
  }

  /**
   * Open the settings panel
   */
  open() {
    if (this.isOpen) {
      return;
    }

    if (!this.panel) {
      this.create();
    }

    // Blur the editor when settings panel opens
    if (this.getEditor) {
      const editor = this.getEditor();
      if (editor && editor.getActiveEditor) {
        const activeEditor = editor.getActiveEditor();
        if (activeEditor && activeEditor.view && activeEditor.view.dom) {
          activeEditor.view.dom.blur();
        }
      }
    }

    document.body.appendChild(this.overlay);
    document.body.appendChild(this.panel);

    this.isOpen = true;

    // Focus first input
    const firstInput = this.panel.querySelector('.settings-input');
    if (firstInput) {
      firstInput.focus();
    }

    // Handle ESC key
    this.escHandler = (e) => {
      if (e.key === 'Escape') {
        this.close();
      }
    };
    document.addEventListener('keydown', this.escHandler);
  }

  /**
   * Close the settings panel
   */
  close() {
    if (!this.isOpen) {
      return;
    }

    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }

    if (this.panel && this.panel.parentNode) {
      this.panel.parentNode.removeChild(this.panel);
    }

    this.isOpen = false;

    // Remove ESC handler
    if (this.escHandler) {
      document.removeEventListener('keydown', this.escHandler);
      this.escHandler = null;
    }

    // Restore focus to the editor when settings panel closes
    if (this.getEditor) {
      const editor = this.getEditor();
      if (editor && editor.focus) {
        editor.focus();
      }
    }
  }

  /**
   * Destroy the panel
   */
  destroy() {
    this.close();
    this.panel = null;
    this.overlay = null;
  }
}
