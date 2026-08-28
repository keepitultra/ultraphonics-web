export const config = {
  // Global Contact Info
  siteInfo: {
    copyrightName: "Ultraphonics, LLC"
  },

  // API Keys and IDs
  ids: {
    googleAnalytics: "G-FEL0XX8F65",
    // Restrict this key in Google Cloud Console to your domain + Maps JS API + Places API
    googleMaps: "YOUR_GOOGLE_MAPS_API_KEY",
    emailjs: {
      publicKey: "KhA8Z-PRCg69qMpWp",
      serviceId: "service_eujinnf",
      contactTemplateId: "template_o1lwsxk",
      quoteTemplateId: "template_0i5n9gk"
    }
  },

  // Navigation Configuration
  pages: {
    home: {
      label: "Home",
      link: "index.html",
    },
    weddings: {
      label: "Weddings",
      link: "weddings.html",
    },
    services: {
      label: "Services",
      link: "services.html",
    },
    band: {
      label: "Band",
      link: "/band",
    },
    quote: {
      label: "Request a Quote",
      link: "quote-request.html",
    },
    contact: {
      label: "Contact",
      link: "contact.html",
    },
    // Anchor links treated as 'pages' for navigation purposes
    shows: {
      label: "Events",
      link: "index.html#shows",
    },
    mediaKit: {
      label: "Media",
      link: "media-kit.html",
    },
  },

  tipping: {
    venmo: "Ultraphonics",
    cashApp: "tomhickman25",
    payPal: "lesterburton17",
    tipAmount: 10,
    note: "🤘",
  },
  
  links: {
    mediaKit: "https://drive.google.com/drive/folders/1FWp2LQpdOpGGXYzdAoZ8KKnkTBOnuebB?usp=sharing",
    stagePlot: "https://drive.google.com/file/d/19QCiGi2nKrpzuGb5ET7U17vBLtI3SJ5R/view?usp=sharing"
  },

  // Selectors for DOM elements
  selectors: {
    // Shows
    showsContainer: "#shows",
    // Buttons & Header
    contactButton: "#contact-button",
    tipButton: "#tip-button",
    requestButton: "#request-button",
    header: "header",
  },
};