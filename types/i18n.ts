/**
 * Type-safe i18n translation keys
 * Auto-generated from messages/ka.json structure
 */

export interface Messages {
  metadata: {
    title: string;
    description: string;
  };
  
  navigation: {
    services: string;
    workspace: string;
    about: string;
    contact: string;
    dashboard: string;
    pricing: string;
    login: string;
    signup: string;
    logout: string;
  };
  
  hero: {
    title: string;
    subtitle: string;
    description: string;
    cta_primary: string;
    cta_secondary: string;
  };
  
  services: {
    title: string;
    subtitle: string;
    avatar_builder: string;
    image_generator: string;
    video_generator: string;
    music_generator: string;
    text_intelligence: string;
    prompt_builder: string;
    image_architect: string;
    music_studio: string;
    voice_lab: string;
    video_cine_lab: string;
    game_forge: string;
    agent_g: string;
    ai_production: string;
    business_agent: string;
    online_shop: string;
    social_media: string;
    marketplace: string;
    pentagon: string;
  };
  
  avatar: {
    title: string;
    description: string;
    section: {
      faceScan: string;
      bodyMeasurement: string;
      styleSelection: string;
      preview: string;
    };
    label: {
      cameraPreview: string;
      retryScan: string;
      capturePhoto: string;
      startCamera: string;
      stopCamera: string;
      nextStep: string;
      previousStep: string;
      generate: string;
      download: string;
      retry: string;
    };
    status: {
      scanning: string;
      processing: string;
      generating: string;
      complete: string;
      error: string;
    };
    error: {
      cameraAccess: string;
      noCamera: string;
      uploadFailed: string;
      generationFailed: string;
    };
  };
  
  pay: {
    title: string;
    description: string;
    label: {
      amount: string;
      serviceName: string;
      payNow: string;
      processing: string;
      currency: string;
    };
    status: {
      pending: string;
      success: string;
      failed: string;
    };
    success: {
      title: string;
      message: string;
      backToDashboard: string;
    };
    cancel: {
      title: string;
      message: string;
      tryAgain: string;
    };
  };
  
  dashboard: {
    title: string;
    welcome: string;
    nav: {
      overview: string;
      billing: string;
      settings: string;
      support: string;
      seller: string;
      admin: string;
    };
    cards: {
      credits: string;
      usage: string;
      plan: string;
      nextBilling: string;
    };
    actions: {
      upgrade: string;
      manage: string;
      viewDetails: string;
      cancel: string;
    };
  };
  
  subscription: {
    title: string;
    chooseYourPlan: string;
    monthly: string;
    annually: string;
    starter: string;
    pro: string;
    business: string;
    enterprise: string;
    features: {
      avatars: string;
      videos: string;
      music: string;
      support: string;
      api: string;
      customLicense: string;
      unlimited: string;
      priority: string;
    };
    actions: {
      subscribe: string;
      upgrade: string;
      downgrade: string;
      cancel: string;
      currentPlan: string;
    };
  };
  
  generator: {
    input_placeholder: string;
    button_generate: string;
    button_download: string;
    button_save: string;
    button_share: string;
    progress_text: string;
    code_rain: string;
    complete: string;
  };
  
  chatbot: {
    title: string;
    subtitle: string;
    placeholder: string;
    voice_input: string;
    voice_output: string;
    file_upload: string;
    thinking: string;
  };
  
  seller: {
    funnel: {
      headline: string;
      subheadline: string;
      cta: string;
      vat_payer: string;
      non_vat: string;
      business_type: string;
      business_dropshipping: string;
      business_own: string;
      business_digital: string;
      target_income: string;
      budget: string;
      continue: string;
      back: string;
      calculating: string;
      simulation_title: string;
      margin_warning: string;
      margin_block: string;
      activate: string;
      activation_processing: string;
    };
    dashboard: {
      nav: string;
      products: string;
      finance: string;
      orders: string;
      payouts: string;
      analytics: string;
      settings: string;
      forecast: string;
    };
    metrics: {
      today_sales: string;
      net_profit: string;
      vat_payable: string;
      breakeven: string;
      risk: string;
      recommended_price: string;
      margin: string;
      gmv: string;
      revenue: string;
      active_sellers: string;
      compliance: string;
    };
    actions: {
      simulate: string;
      activate_vat: string;
      request_payout: string;
      launch_product: string;
      view_details: string;
      export_report: string;
    };
    pricing: {
      mode_growth: string;
      mode_profit: string;
      mode_hybrid: string;
      platform_fee: string;
      vat_rate: string;
      margin_floor: string;
      margin_target: string;
    };
    growth: {
      title: string;
      dm_script: string;
      tiktok_script: string;
      email_template: string;
      referral: string;
      cac: string;
      ltv: string;
      generate_script: string;
    };
    forecast: {
      title: string;
      month_1: string;
      month_3: string;
      month_6: string;
      gmv_projection: string;
      revenue_projection: string;
      net_profit_projection: string;
      confidence: string;
    };
  };
  
  common: {
    loading: string;
    error: string;
    success: string;
    cancel: string;
    save: string;
    delete: string;
    edit: string;
    close: string;
    back: string;
    next: string;
    submit: string;
    retry: string;
    confirm: string;
    yes: string;
    no: string;
  };
  
  errors: {
    generic: string;
    network: string;
    unauthorized: string;
    notFound: string;
    serverError: string;
  };
}

// Type helper for nested translation keys
export type TranslationKey = 
  | `metadata.${keyof Messages['metadata']}`
  | `navigation.${keyof Messages['navigation']}`
  | `hero.${keyof Messages['hero']}`
  | `services.${keyof Messages['services']}`
  | `avatar.${keyof Messages['avatar']}`
  | `avatar.section.${keyof Messages['avatar']['section']}`
  | `avatar.label.${keyof Messages['avatar']['label']}`
  | `avatar.status.${keyof Messages['avatar']['status']}`
  | `avatar.error.${keyof Messages['avatar']['error']}`
  | `pay.${keyof Messages['pay']}`
  | `pay.label.${keyof Messages['pay']['label']}`
  | `pay.status.${keyof Messages['pay']['status']}`
  | `pay.success.${keyof Messages['pay']['success']}`
  | `pay.cancel.${keyof Messages['pay']['cancel']}`
  | `dashboard.${keyof Messages['dashboard']}`
  | `dashboard.nav.${keyof Messages['dashboard']['nav']}`
  | `dashboard.cards.${keyof Messages['dashboard']['cards']}`
  | `dashboard.actions.${keyof Messages['dashboard']['actions']}`
  | `subscription.${keyof Messages['subscription']}`
  | `subscription.features.${keyof Messages['subscription']['features']}`
  | `subscription.actions.${keyof Messages['subscription']['actions']}`
  | `generator.${keyof Messages['generator']}`
  | `chatbot.${keyof Messages['chatbot']}`
  | `seller.funnel.${keyof Messages['seller']['funnel']}`
  | `seller.dashboard.${keyof Messages['seller']['dashboard']}`
  | `seller.metrics.${keyof Messages['seller']['metrics']}`
  | `seller.actions.${keyof Messages['seller']['actions']}`
  | `seller.pricing.${keyof Messages['seller']['pricing']}`
  | `seller.growth.${keyof Messages['seller']['growth']}`
  | `seller.forecast.${keyof Messages['seller']['forecast']}`
  | `common.${keyof Messages['common']}`
  | `errors.${keyof Messages['errors']}`;
