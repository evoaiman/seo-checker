#!/usr/bin/env node

/**
 * SEO Checker for Nuxt Projects
 * Checks for generateSEO() usage, sitemap coverage, and schema implementation
 * Can be used across multiple projects
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  gray: '\x1b[90m'
};

// Get project root (where the command is run from)
const projectRoot = process.cwd();

// Auto-detect project structure
function detectProjectStructure() {
  const possiblePaths = {
    pagesDir: [
      path.join(projectRoot, 'app/pages'),
      path.join(projectRoot, 'pages'),
      path.join(projectRoot, 'src/pages')
    ],
    sitemapFile: [
      path.join(projectRoot, 'server/api/sitemap/static.ts'),
      path.join(projectRoot, 'server/api/sitemap.ts'),
      path.join(projectRoot, 'server/sitemap.ts')
    ],
    nuxtConfig: [
      path.join(projectRoot, 'nuxt.config.ts'),
      path.join(projectRoot, 'nuxt.config.js')
    ],
    seoUtilFile: [
      path.join(projectRoot, 'app/utils/seo.js'),
      path.join(projectRoot, 'utils/seo.js'),
      path.join(projectRoot, 'app/utils/seo.ts'),
      path.join(projectRoot, 'utils/seo.ts')
    ]
  };

  const config = {
    projectName: path.basename(projectRoot),
    pagesDir: null,
    sitemapFile: null,
    nuxtConfig: null,
    seoUtilFile: null,
    requiredSchemas: {
      '/': ['WebPage', 'Organization'],
      '/contact': ['ContactPage', 'Organization'],
      '/sponsorship': ['Grant', 'Organization'],
      '/about': ['WebPage', 'Organization'],
      '/privacy-policy': ['WebPage'],
      '/product-warranty': ['WebPage']
    },
    ignorePaths: ['purchase/order', 'purchase/orderLead', 'purchase', 'admin', 'api'] // Common dynamic/transactional pages
  };

  // Find existing paths
  for (const [key, paths] of Object.entries(possiblePaths)) {
    for (const possiblePath of paths) {
      if (fs.existsSync(possiblePath)) {
        config[key] = possiblePath;
        break;
      }
    }
  }

  return config;
}

// Configuration
const config = detectProjectStructure();

// Results storage
const results = {
  pagesWithSEO: [],
  pagesWithoutSEO: [],
  sitemapPages: [],
  missingFromSitemap: [],
  schemaIssues: [],
  robotsConfig: null,
  warnings: [],
  errors: [],
  // New enhanced metrics
  metaTagIssues: [],
  ogTagsCoverage: [],
  twitterTagsCoverage: [],
  headingIssues: [],
  imageStats: {
    totalImages: 0,
    imagesWithAlt: 0,
    imagesWithoutAlt: []
  },
  canonicalTags: [],
  // OG Image tracking
  ogImageUsage: {}, // { imageUrl: [pages] }
  pagesWithoutOGImage: [],
  // Category scores
  categoryScores: {
    metaTags: { score: 0, maxScore: 20, issues: [] },
    technicalSEO: { score: 0, maxScore: 20, issues: [] },
    structuredData: { score: 0, maxScore: 20, issues: [] },
    imagesMedia: { score: 0, maxScore: 20, issues: [] },
    socialSharing: { score: 0, maxScore: 20, issues: [] }
  }
};

/**
 * Find all Vue files recursively
 */
function findVueFiles(dir, fileList = []) {
  try {
    const files = fs.readdirSync(dir);
    
    files.forEach(file => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory()) {
        findVueFiles(filePath, fileList);
      } else if (file.endsWith('.vue')) {
        fileList.push(filePath);
      }
    });
  } catch (err) {
    results.errors.push(`Error reading directory ${dir}: ${err.message}`);
  }
  
  return fileList;
}

/**
 * Extract generateSEO parameters from content
 */
function extractGenerateSEOParams(content) {
  // Find generateSEO call - handle multi-line calls
  const generateSEOMatch = content.match(/generateSEO\s*\(\s*\{([\s\S]*?)\}\s*\)/);
  if (!generateSEOMatch) return null;
  
  const paramString = generateSEOMatch[1];
  const params = {};
  
  // Extract basic parameters
  const titleMatch = paramString.match(/title:\s*[`"']([^`"']*)[`"']/);
  if (titleMatch) params.title = titleMatch[1];
  
  const descMatch = paramString.match(/description:\s*[`"']([^`"']*)[`"']/);
  if (descMatch) params.description = descMatch[1];
  
  // Extract image parameter
  const imageMatch = paramString.match(/image:\s*[`"']([^`"']*)[`"']|image:\s*`([^`]*)`/);
  if (imageMatch) params.image = imageMatch[1] || imageMatch[2];
  
  // Extract array parameters with counts
  const arrayParams = ['faqs', 'branches', 'services', 'products', 'news'];
  arrayParams.forEach(param => {
    const arrayMatch = paramString.match(new RegExp(`${param}:\\s*\\[([\\s\\S]*?)\\]`, 'm'));
    if (arrayMatch) {
      const arrayContent = arrayMatch[1].trim();
      if (arrayContent) {
        // Count objects in array (rough estimate by counting opening braces)
        const objectCount = (arrayContent.match(/\{/g) || []).length;
        params[param] = objectCount > 0 ? objectCount : 1;
      }
    }
  });
  
  // Extract object parameters
  const objectParams = ['grant', 'contactPage', 'awards'];
  objectParams.forEach(param => {
    const objectMatch = paramString.match(new RegExp(`${param}:\\s*\\{([\\s\\S]*?)\\}`, 'm'));
    if (objectMatch) {
      params[param] = true;
    }
  });
  
  return params;
}

/**
 * Dynamically evaluate generateSEO function with actual parameters
 */
async function evaluateGenerateSEO(params, projectRoot) {
  try {
    // Look for seo.js in common locations
    const possiblePaths = [
      path.join(projectRoot, 'app/utils/seo.js'),
      path.join(projectRoot, 'utils/seo.js'),
      path.join(projectRoot, 'app/utils/seo.ts'),
      path.join(projectRoot, 'utils/seo.ts')
    ];
    
    let seoPath = null;
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        seoPath = p;
        break;
      }
    }
    
    if (!seoPath) {
      return null; // Can't evaluate without seo utility
    }
    
    // Read the seo.js file
    const seoContent = fs.readFileSync(seoPath, 'utf8');
    
    // Create mock Nuxt utilities
    const mockContext = {
      useRequestURL: () => ({
        origin: 'https://example.com',
        pathname: '/test-page',
        href: 'https://example.com/test-page'
      }),
      useRuntimeConfig: () => ({
        public: {
          siteUrl: 'https://example.com'
        }
      })
    };
    
    // Create a sandbox to execute the generateSEO function
    const sandbox = {
      ...mockContext,
      console,
      Date,
      JSON,
      Object,
      Array,
      String,
      Number,
      Boolean,
      // Export object to capture the function
      exports: {},
      module: { exports: {} }
    };
    
    // Try to extract just the generateSEO function
    const generateSEOMatch = seoContent.match(/(?:export\s+)?(?:const|function)\s+generateSEO\s*=?\s*\([^)]*\)\s*(?:=>)?\s*\{[\s\S]*?(?=\n(?:export|const|function|$))/);
    
    if (!generateSEOMatch) {
      // If we can't extract the function, fall back to parameter mapping
      return null;
    }
    
    // Create a wrapper to execute the function
    const wrappedCode = `
      ${generateSEOMatch[0]}
      
      // Helper functions that might be needed
      const generateFAQSchema = (faqs) => {
        if (!faqs || !faqs.length) return [];
        return [{
          "@type": "FAQPage",
          mainEntity: faqs.map(faq => ({
            "@type": "Question",
            name: faq.question,
            acceptedAnswer: {
              "@type": "Answer",
              text: faq.answer
            }
          }))
        }];
      };
      
      const generateBranchSchema = (branches) => {
        if (!branches || !branches.length) return [];
        return branches.map(branch => ({
          "@type": "LocalBusiness",
          name: branch.name
        }));
      };
      
      const generateServiceSchema = (services) => {
        if (!services || !services.length) return [];
        return services.map(service => ({
          "@type": "Service",
          name: service.name
        }));
      };
      
      const generateProductSchema = (products) => {
        if (!products || !products.length) return [];
        return products.map(product => ({
          "@type": "Product",
          name: product.name
        }));
      };
      
      const generateNewsArticleSchema = () => [];
      const generateGrantSchema = (grant) => grant ? { "@type": "Grant" } : null;
      const generateContactPageSchema = (contactPage) => contactPage ? { "@type": "ContactPage" } : null;
      
      // Execute the function
      const result = generateSEO(params);
      result;
    `;
    
    // Execute in sandbox
    const script = new vm.Script(wrappedCode);
    const context = vm.createContext({ ...sandbox, params });
    const result = script.runInContext(context);
    
    return result;
  } catch (error) {
    // If dynamic evaluation fails, return null to fall back to static analysis
    console.log(colors.gray + `  Note: Could not dynamically evaluate generateSEO: ${error.message}` + colors.reset);
    return null;
  }
}

/**
 * Map generateSEO parameters to actual schema types
 */
function mapParamsToSchemas(params) {
  if (!params) return [];
  
  const schemas = [];
  
  // Base schemas that are always present
  schemas.push('WebPage');
  schemas.push('Organization');
  
  // Conditional schemas based on parameters
  if (params.faqs && params.faqs > 0) {
    schemas.push(`FAQPage (${params.faqs} FAQs)`);
  }
  
  if (params.products && params.products > 0) {
    schemas.push(`Product (${params.products} products)`);
  }
  
  if (params.services && params.services > 0) {
    schemas.push(`Service (${params.services} services)`);
  }
  
  if (params.branches && params.branches > 0) {
    schemas.push(`LocalBusiness (${params.branches} branches)`);
  }
  
  if (params.news && params.news > 0) {
    schemas.push(`NewsArticle (${params.news} articles)`);
  }
  
  if (params.grant) {
    schemas.push('Grant');
  }
  
  if (params.contactPage) {
    schemas.push('ContactPage');
  }
  
  if (params.awards) {
    schemas.push('Awards');
  }
  
  // Only add BreadcrumbList if explicitly defined in parameters
  if (params.breadcrumb) {
    schemas.push('BreadcrumbList');
  }
  
  return schemas;
}

/**
 * Check meta tags from actual generateSEO output or fallback to content analysis
 */
function checkMetaTags(content, pageName, seoOutput = null) {
  const metaInfo = {
    title: null,
    description: null,
    ogTags: {},
    twitterTags: {},
    canonical: null,
    issues: []
  };
  
  // If we have actual generateSEO output, use it
  if (seoOutput && seoOutput.meta) {
    // Extract title from meta array
    const titleMeta = seoOutput.meta.find(m => m.name === 'title' || m.hid === 'title');
    if (titleMeta) {
      metaInfo.title = titleMeta.content;
      // Check title length (50-60 chars optimal)
      if (titleMeta.content.length < 30) {
        metaInfo.issues.push(`Title too short (${titleMeta.content.length} chars, recommended: 50-60)`);
      } else if (titleMeta.content.length > 60) {
        metaInfo.issues.push(`Title too long (${titleMeta.content.length} chars, recommended: 50-60)`);
      }
    }
    
    // Extract description
    const descMeta = seoOutput.meta.find(m => m.name === 'description' || m.hid === 'description');
    if (descMeta) {
      metaInfo.description = descMeta.content;
      // Check description length (120-160 chars optimal)
      if (descMeta.content.length < 120) {
        metaInfo.issues.push(`Meta description too short (${descMeta.content.length} chars, recommended: 120-160)`);
      } else if (descMeta.content.length > 160) {
        metaInfo.issues.push(`Meta description too long (${descMeta.content.length} chars, recommended: 120-160)`);
      }
    }
    
    // Check OG tags
    const ogTagsInOutput = seoOutput.meta.filter(m => m.property && m.property.startsWith('og:'));
    ogTagsInOutput.forEach(tag => {
      const tagName = tag.property.replace('og:', '');
      metaInfo.ogTags[tagName] = true;
      
      // Track OG image specifically
      if (tagName === 'image') {
        metaInfo.ogImage = tag.content;
      }
    });
    
    // Check Twitter tags
    const twitterTagsInOutput = seoOutput.meta.filter(m => m.name && m.name.startsWith('twitter:'));
    twitterTagsInOutput.forEach(tag => {
      const tagName = tag.name.replace('twitter:', '');
      metaInfo.twitterTags[tagName] = true;
    });
    
    // Check canonical
    if (seoOutput.link && seoOutput.link.some(l => l.rel === 'canonical')) {
      metaInfo.canonical = true;
    }
    
    // Check for missing required tags
    const requiredOgTags = ['title', 'description', 'image', 'url'];
    const missingOgTags = requiredOgTags.filter(tag => !metaInfo.ogTags[tag]);
    if (missingOgTags.length > 0) {
      metaInfo.issues.push(`Missing Open Graph tags: ${missingOgTags.join(', ')}`);
    }
    
    const requiredTwitterTags = ['card', 'title', 'description', 'image'];
    const missingTwitterTags = requiredTwitterTags.filter(tag => !metaInfo.twitterTags[tag]);
    if (missingTwitterTags.length > 0) {
      metaInfo.issues.push(`Missing Twitter Card tags: ${missingTwitterTags.join(', ')}`);
    }
    
    if (!metaInfo.canonical) {
      metaInfo.issues.push('Missing canonical URL');
    }
    
    return metaInfo;
  }
  
  // Fallback to static content analysis if no seoOutput
  // Check for title - in generateSEO or useHead
  const titleMatch = content.match(/title:\s*[`"']([^`"']*)[`"']/);
  if (titleMatch) {
    metaInfo.title = titleMatch[1];
    // Check title length (50-60 chars optimal)
    if (titleMatch[1].length < 30) {
      metaInfo.issues.push(`Title too short (${titleMatch[1].length} chars, recommended: 50-60)`);
    } else if (titleMatch[1].length > 60) {
      metaInfo.issues.push(`Title too long (${titleMatch[1].length} chars, recommended: 50-60)`);
    }
  } else {
    metaInfo.issues.push('Missing page title');
  }
  
  // Check for meta description
  const descMatch = content.match(/description:\s*[`"']([^`"']*)[`"']/);
  if (descMatch) {
    metaInfo.description = descMatch[1];
    // Check description length (120-160 chars optimal)
    if (descMatch[1].length < 120) {
      metaInfo.issues.push(`Meta description too short (${descMatch[1].length} chars, recommended: 120-160)`);
    } else if (descMatch[1].length > 160) {
      metaInfo.issues.push(`Meta description too long (${descMatch[1].length} chars, recommended: 120-160)`);
    }
  } else {
    metaInfo.issues.push('Missing meta description');
  }
  
  // For pages using generateSEO, assume OG and Twitter tags are present
  if (content.includes('generateSEO(')) {
    // generateSEO always provides these tags
    metaInfo.ogTags = { title: true, description: true, image: true, url: true, type: true, site_name: true };
    metaInfo.twitterTags = { card: true, title: true, description: true, image: true, site: true };
    metaInfo.canonical = true;
    
    // Try to extract OG image from content if not from seoOutput
    if (!metaInfo.ogImage) {
      const imageMatch = content.match(/image:\s*[`"']([^`"']*)[`"']/);
      if (imageMatch) {
        metaInfo.ogImage = imageMatch[1];
      }
    }
  } else {
    // Manual checking for non-generateSEO pages
    const ogTags = [
      'og:title', 'og:description', 'og:image', 'og:url', 
      'og:type', 'og:site_name', 'ogTitle', 'ogDescription', 
      'ogImage', 'ogUrl', 'ogType', 'ogSiteName'
    ];
    
    ogTags.forEach(tag => {
      const tagName = tag.replace('og:', '').replace(/([A-Z])/g, (match) => match.toLowerCase());
      if (content.includes(tag)) {
        metaInfo.ogTags[tagName] = true;
      }
    });
    
    const requiredOgTags = ['title', 'description', 'image', 'url'];
    const missingOgTags = requiredOgTags.filter(tag => !metaInfo.ogTags[tag]);
    if (missingOgTags.length > 0) {
      metaInfo.issues.push(`Missing Open Graph tags: ${missingOgTags.join(', ')}`);
    }
    
    // Check Twitter Card tags
    const twitterTags = [
      'twitter:card', 'twitter:title', 'twitter:description', 
      'twitter:image', 'twitter:site', 'twitterCard', 
      'twitterTitle', 'twitterDescription', 'twitterImage'
    ];
    
    twitterTags.forEach(tag => {
      const tagName = tag.replace('twitter:', '').replace(/([A-Z])/g, (match) => match.toLowerCase());
      if (content.includes(tag)) {
        metaInfo.twitterTags[tagName] = true;
      }
    });
    
    const requiredTwitterTags = ['card', 'title', 'description', 'image'];
    const missingTwitterTags = requiredTwitterTags.filter(tag => !metaInfo.twitterTags[tag]);
    if (missingTwitterTags.length > 0) {
      metaInfo.issues.push(`Missing Twitter Card tags: ${missingTwitterTags.join(', ')}`);
    }
    
    // Check canonical tag
    if (content.includes('canonical:') || content.includes('link.*rel.*canonical')) {
      metaInfo.canonical = true;
    } else {
      metaInfo.issues.push('Missing canonical URL');
    }
  }
  
  return metaInfo;
}

/**
 * Check heading structure (H1-H6 hierarchy)
 */
function checkHeadingStructure(content, pageName) {
  const headingInfo = {
    h1Count: 0,
    headings: [],
    issues: []
  };
  
  // Match h1-h6 tags in template
  const templateMatch = content.match(/<template[^>]*>([\s\S]*?)<\/template>/);
  if (templateMatch) {
    const template = templateMatch[1];
    
    // Count H1 tags
    const h1Matches = template.match(/<h1[^>]*>/gi) || [];
    headingInfo.h1Count = h1Matches.length;
    
    if (headingInfo.h1Count === 0) {
      headingInfo.issues.push('No H1 tag found');
    } else if (headingInfo.h1Count > 1) {
      headingInfo.issues.push(`Multiple H1 tags found (${headingInfo.h1Count}), should have only 1`);
    }
    
    // Check heading hierarchy
    const headingMatches = template.match(/<h([1-6])[^>]*>/gi) || [];
    let lastLevel = 0;
    let hierarchyBroken = false;
    
    headingMatches.forEach(heading => {
      const level = parseInt(heading.match(/<h([1-6])/i)[1]);
      headingInfo.headings.push(level);
      
      if (lastLevel > 0 && level > lastLevel + 1) {
        hierarchyBroken = true;
      }
      lastLevel = level;
    });
    
    if (hierarchyBroken) {
      headingInfo.issues.push('Heading hierarchy broken (skipped levels)');
    }
  }
  
  return headingInfo;
}

/**
 * Check images for alt text and optimization
 */
function checkImages(content, pageName) {
  const imageInfo = {
    totalImages: 0,
    imagesWithAlt: 0,
    imagesWithoutAlt: 0,
    issues: []
  };
  
  // Match img tags and NuxtImg components
  const templateMatch = content.match(/<template[^>]*>([\s\S]*?)<\/template>/);
  if (templateMatch) {
    const template = templateMatch[1];
    
    // Regular img tags
    const imgTags = template.match(/<img[^>]*>/gi) || [];
    const nuxtImgTags = template.match(/<NuxtImg[^>]*>/gi) || [];
    const allImages = [...imgTags, ...nuxtImgTags];
    
    imageInfo.totalImages = allImages.length;
    
    allImages.forEach(img => {
      if (img.includes('alt=') && !img.includes('alt=""') && !img.includes("alt=''")) {
        imageInfo.imagesWithAlt++;
      } else {
        imageInfo.imagesWithoutAlt++;
      }
    });
    
    if (imageInfo.imagesWithoutAlt > 0) {
      const altCoverage = Math.round((imageInfo.imagesWithAlt / imageInfo.totalImages) * 100);
      imageInfo.issues.push(`${imageInfo.imagesWithoutAlt} images missing alt text (${altCoverage}% coverage)`);
    }
    
    // Check for lazy loading
    const lazyLoadedImages = allImages.filter(img => 
      img.includes('loading="lazy"') || img.includes('lazy=')
    ).length;
    
    if (imageInfo.totalImages > 2 && lazyLoadedImages < imageInfo.totalImages - 2) {
      imageInfo.issues.push('Consider implementing lazy loading for below-the-fold images');
    }
  }
  
  return imageInfo;
}

/**
 * Check if a Vue file has generateSEO() implementation
 */
async function checkPageSEO(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const relativePath = path.relative(config.pagesDir, filePath);
    const pageName = relativePath.replace(/\.vue$/, '');
    
    // Check if page should be ignored
    const shouldIgnore = config.ignorePaths.some(ignorePath => 
      relativePath.includes(ignorePath)
    );
    
    if (shouldIgnore) {
      return null;
    }
    
    // Check for generateSEO usage (also check for useSeoMeta as alternative)
    const hasGenerateSEO = content.includes('generateSEO(');
    const hasUseSeoMeta = content.includes('useSeoMeta(');
    const hasUseHead = content.includes('useHead(');
    
    // Extract schema types if generateSEO is used
    let schemas = [];
    let schemaDetails = null;
    let seoOutput = null;
    
    if (hasGenerateSEO) {
      // Extract parameters from generateSEO call
      const extractedParams = extractGenerateSEOParams(content);
      
      // Try to dynamically evaluate generateSEO
      if (extractedParams) {
        seoOutput = await evaluateGenerateSEO(extractedParams, projectRoot);
        
        if (seoOutput) {
          // Extract schemas from actual output
          if (seoOutput.script && seoOutput.script[0] && seoOutput.script[0].innerHTML) {
            try {
              const jsonLd = JSON.parse(seoOutput.script[0].innerHTML);
              if (jsonLd['@graph']) {
                schemas = jsonLd['@graph']
                  .filter(item => item['@type'])
                  .map(item => {
                    const type = item['@type'];
                    // Add counts for certain types
                    if (type === 'FAQPage' && item.mainEntity) {
                      return `${type} (${item.mainEntity.length} FAQs)`;
                    }
                    if (type === 'Product') {
                      return `${type}`;
                    }
                    return type;
                  });
              }
            } catch (e) {
              // If parsing fails, fall back to parameter mapping
              schemas = mapParamsToSchemas(extractedParams);
            }
          } else {
            // Fall back to parameter mapping
            schemas = mapParamsToSchemas(extractedParams);
          }
        } else {
          // If dynamic evaluation fails, use parameter mapping
          schemas = mapParamsToSchemas(extractedParams);
        }
        
        schemaDetails = extractedParams;
      }
      
      // Fallback to basic detection for edge cases
      if (schemas.length === 0) {
        // Check for specific schema properties (legacy detection)
        if (content.includes('contactPage:')) schemas.push('ContactPage');
        if (content.includes('grant:')) schemas.push('Grant');
        if (content.includes('products:')) schemas.push('Product');
        if (content.includes('services:')) schemas.push('Service');
        if (content.includes('faqs:')) schemas.push('FAQPage');
        // Only detect breadcrumb if explicitly present in generateSEO call
        if (content.includes('breadcrumb:') || content.includes('breadcrumbs:')) schemas.push('BreadcrumbList');
      }
    }
    
    // Perform enhanced checks - pass seoOutput if available
    const metaTagInfo = checkMetaTags(content, pageName, seoOutput);
    const headingInfo = checkHeadingStructure(content, pageName);
    const imageInfo = checkImages(content, pageName);
    
    return {
      path: relativePath,
      pageName,
      hasGenerateSEO,
      hasUseSeoMeta,
      hasUseHead,
      schemas,
      schemaDetails,
      hasSEO: (hasGenerateSEO || hasUseSeoMeta) && hasUseHead,
      // Enhanced metrics
      metaTags: metaTagInfo,
      headings: headingInfo,
      images: imageInfo
    };
  } catch (err) {
    results.errors.push(`Error reading file ${filePath}: ${err.message}`);
    return null;
  }
}

/**
 * Check sitemap configuration
 */
function checkSitemap() {
  try {
    if (config.sitemapFile && fs.existsSync(config.sitemapFile)) {
      const content = fs.readFileSync(config.sitemapFile, 'utf8');
      
      // Extract URLs from sitemap (excluding image paths)
      const urlMatches = content.match(/loc:\s*[`'"]([^`'"]+)[`'"]/g) || [];
      const urls = urlMatches
        .map(match => {
          const url = match.match(/[`'"]([^`'"]+)[`'"]/)[1];
          return url.replace(/^\//, ''); // Remove leading slash
        })
        .filter(url => !url.includes('/img/') && !url.includes('.png') && !url.includes('.jpg')); // Filter out images
      
      results.sitemapPages = urls;
    } else {
      results.warnings.push('Sitemap file not found - checked common locations');
    }
  } catch (err) {
    results.errors.push(`Error reading sitemap: ${err.message}`);
  }
}

/**
 * Check robots configuration in nuxt.config.ts
 */
function checkRobotsConfig() {
  try {
    if (config.nuxtConfig && fs.existsSync(config.nuxtConfig)) {
      const content = fs.readFileSync(config.nuxtConfig, 'utf8');
      
      // Check if robots module is configured
      const hasRobotsModule = content.includes('@nuxtjs/robots');
      const hasRobotsConfig = content.includes('robots:');
      
      // Also check for robots.txt file
      const robotsTxtPath = path.join(projectRoot, 'public/robots.txt');
      const hasRobotsTxt = fs.existsSync(robotsTxtPath);
      
      if (hasRobotsModule && hasRobotsConfig) {
        results.robotsConfig = {
          configured: true,
          module: '@nuxtjs/robots',
          message: 'Robots configuration found in nuxt.config'
        };
        
        // Check for production/non-production rules
        if (content.includes('process.env.ENV_TYPE') || content.includes('process.env.NODE_ENV')) {
          results.robotsConfig.hasEnvironmentRules = true;
        }
      } else if (hasRobotsModule) {
        results.robotsConfig = {
          configured: true,
          module: '@nuxtjs/robots',
          message: 'Robots module installed but no configuration found'
        };
      } else if (hasRobotsTxt) {
        results.robotsConfig = {
          configured: true,
          module: 'static file',
          message: 'Static robots.txt file found'
        };
      } else {
        results.robotsConfig = {
          configured: false,
          message: 'No robots configuration found'
        };
      }
    }
  } catch (err) {
    results.errors.push(`Error reading nuxt.config: ${err.message}`);
  }
}

/**
 * Calculate category scores based on collected metrics
 */
function calculateCategoryScores() {
  const totalPages = results.pagesWithSEO.length + results.pagesWithoutSEO.length;
  if (totalPages === 0) return;
  
  // Meta Tags Score (max 20)
  let metaScore = 20;
  results.pagesWithSEO.forEach(page => {
    if (page.metaTags && page.metaTags.issues.length > 0) {
      metaScore -= page.metaTags.issues.length * 0.5;
      results.categoryScores.metaTags.issues.push(...page.metaTags.issues.map(issue => 
        `${page.pageName}: ${issue}`
      ));
    }
  });
  results.pagesWithoutSEO.forEach(page => {
    metaScore -= 2;
    results.categoryScores.metaTags.issues.push(`${page.pageName}: No SEO implementation`);
  });
  results.categoryScores.metaTags.score = Math.max(0, metaScore);
  
  // Technical SEO Score (max 20)
  let techScore = 20;
  // Canonical tags
  const pagesWithoutCanonical = results.pagesWithSEO.filter(page => 
    page.metaTags && !page.metaTags.canonical
  ).length;
  techScore -= pagesWithoutCanonical * 1;
  
  // Heading structure
  results.pagesWithSEO.forEach(page => {
    if (page.headings && page.headings.issues.length > 0) {
      techScore -= page.headings.issues.length * 0.5;
      results.categoryScores.technicalSEO.issues.push(...page.headings.issues.map(issue => 
        `${page.pageName}: ${issue}`
      ));
    }
  });
  
  // Robots and sitemap
  if (!results.robotsConfig || !results.robotsConfig.configured) {
    techScore -= 3;
    results.categoryScores.technicalSEO.issues.push('No robots configuration');
  }
  if (results.missingFromSitemap.length > 0) {
    techScore -= Math.min(3, results.missingFromSitemap.length * 0.5);
    results.categoryScores.technicalSEO.issues.push(`${results.missingFromSitemap.length} pages missing from sitemap`);
  }
  results.categoryScores.technicalSEO.score = Math.max(0, techScore);
  
  // Structured Data Score (max 20)
  let schemaScore = 20;
  const pagesWithSchemas = results.pagesWithSEO.filter(page => page.schemas.length > 0).length;
  const schemaPercentage = totalPages > 0 ? (pagesWithSchemas / totalPages) : 0;
  schemaScore = Math.round(schemaPercentage * 20);
  
  // Bonus for rich schemas
  const hasRichSchemas = results.pagesWithSEO.some(page => 
    page.schemas.some(s => s.includes('Product') || s.includes('FAQ') || s.includes('LocalBusiness'))
  );
  if (hasRichSchemas) schemaScore = Math.min(20, schemaScore + 2);
  results.categoryScores.structuredData.score = schemaScore;
  
  // Images & Media Score (max 20)
  let imageScore = 20;
  let totalImages = 0;
  let imagesWithoutAlt = 0;
  
  results.pagesWithSEO.forEach(page => {
    if (page.images) {
      totalImages += page.images.totalImages;
      imagesWithoutAlt += page.images.imagesWithoutAlt;
      if (page.images.issues.length > 0) {
        results.categoryScores.imagesMedia.issues.push(...page.images.issues.map(issue => 
          `${page.pageName}: ${issue}`
        ));
      }
    }
  });
  
  if (totalImages > 0) {
    const altCoverage = (totalImages - imagesWithoutAlt) / totalImages;
    imageScore = Math.round(altCoverage * 20);
  }
  results.categoryScores.imagesMedia.score = Math.max(0, imageScore);
  
  // Social Sharing Score (max 20)
  let socialScore = 20;
  let pagesWithOG = 0;
  let pagesWithTwitter = 0;
  
  results.pagesWithSEO.forEach(page => {
    if (page.metaTags) {
      if (Object.keys(page.metaTags.ogTags).length >= 4) pagesWithOG++;
      if (Object.keys(page.metaTags.twitterTags).length >= 4) pagesWithTwitter++;
      
      const ogIssues = page.metaTags.issues.filter(i => i.includes('Open Graph'));
      const twitterIssues = page.metaTags.issues.filter(i => i.includes('Twitter'));
      
      if (ogIssues.length > 0 || twitterIssues.length > 0) {
        socialScore -= 1;
        results.categoryScores.socialSharing.issues.push(
          `${page.pageName}: ${[...ogIssues, ...twitterIssues].join(', ')}`
        );
      }
    }
  });
  
  if (totalPages > 0) {
    const ogCoverage = pagesWithOG / totalPages;
    const twitterCoverage = pagesWithTwitter / totalPages;
    socialScore = Math.round(((ogCoverage + twitterCoverage) / 2) * 20);
  }
  results.categoryScores.socialSharing.score = Math.max(0, socialScore);
  
  // Update global image stats
  results.imageStats.totalImages = totalImages;
  results.imageStats.imagesWithAlt = totalImages - imagesWithoutAlt;
}

/**
 * Generate report
 */
function generateReport() {
  console.log('\n' + colors.bright + '=' + '='.repeat(40) + colors.reset);
  console.log(colors.bright + `SEO Check Report - ${config.projectName}` + colors.reset);
  console.log(colors.bright + '=' + '='.repeat(40) + colors.reset + '\n');
  
  // Check if pages directory was found
  if (!config.pagesDir) {
    console.log(colors.red + '❌ Could not find pages directory' + colors.reset);
    console.log(colors.gray + '  Searched in: app/pages, pages, src/pages' + colors.reset);
    return;
  }
  
  // Calculate category scores
  calculateCategoryScores();
  
  // Overall Score
  const totalScore = Object.values(results.categoryScores).reduce((sum, cat) => sum + cat.score, 0);
  const maxScore = Object.values(results.categoryScores).reduce((sum, cat) => sum + cat.maxScore, 0);
  const overallPercentage = Math.round((totalScore / maxScore) * 100);
  
  // Display Overall Score
  console.log(colors.bright + '📊 Overall Score: ' + colors.reset + 
    (overallPercentage >= 80 ? colors.green : overallPercentage >= 60 ? colors.yellow : colors.red) +
    `${totalScore}/${maxScore} (${overallPercentage}%)` + colors.reset + '\n');
  
  // Category Breakdown
  console.log(colors.bright + 'Category Breakdown:' + colors.reset);
  Object.entries(results.categoryScores).forEach(([category, data]) => {
    const percentage = Math.round((data.score / data.maxScore) * 100);
    const icon = percentage >= 80 ? '✅' : percentage >= 60 ? '⚠️ ' : '❌';
    const categoryName = category.replace(/([A-Z])/g, ' $1').trim();
    console.log(`${icon} ${categoryName.padEnd(20)} ${data.score.toString().padStart(2)}/${data.maxScore} (${percentage}%)`);
  });
  console.log('');
  
  // Critical Issues Summary
  const criticalIssues = [];
  Object.entries(results.categoryScores).forEach(([category, data]) => {
    if (data.issues.length > 0 && data.score < data.maxScore * 0.6) {
      criticalIssues.push(...data.issues.slice(0, 3)); // Top 3 issues per category
    }
  });
  
  if (criticalIssues.length > 0) {
    console.log(colors.red + 'Critical Issues' + colors.reset + ` (${Math.min(5, criticalIssues.length)}):`);
    criticalIssues.slice(0, 5).forEach(issue => {
      console.log(colors.red + '❌ ' + issue + colors.reset);
    });
    console.log('');
  }
  
  // Pages with SEO
  const totalPages = results.pagesWithSEO.length + results.pagesWithoutSEO.length;
  const seoPercentage = totalPages > 0 ? Math.round((results.pagesWithSEO.length / totalPages) * 100) : 0;
  
  if (totalPages === 0) {
    console.log(colors.yellow + '⚠️  No Vue pages found to check' + colors.reset);
  } else {
    console.log(colors.green + '✅ Pages with SEO' + colors.reset + ` (${results.pagesWithSEO.length}/${totalPages})`);
    results.pagesWithSEO.forEach(page => {
      console.log(colors.gray + '  ✓ ' + page.path + colors.reset);
      
      // Show schemas
      if (page.schemas.length > 0) {
        console.log(colors.blue + '    📋 Schemas: ' + colors.reset + page.schemas.join(', '));
      } else {
        console.log(colors.yellow + '    ⚠️  No schemas detected' + colors.reset);
      }
      
      // Show title, description, and image from schemaDetails
      if (page.schemaDetails) {
        // Title with length indicator
        if (page.schemaDetails.title) {
          const titleLen = page.schemaDetails.title.length;
          const titleStatus = titleLen < 30 ? colors.yellow + ' ⚠️' : 
                             titleLen > 60 ? colors.yellow + ' ⚠️' : 
                             colors.green + ' ✅';
          console.log(colors.gray + '    📝 Title: "' + page.schemaDetails.title + '" (' + titleLen + ' chars)' + titleStatus + colors.reset);
        }
        
        // Description with length indicator
        if (page.schemaDetails.description) {
          const descLen = page.schemaDetails.description.length;
          const descStatus = descLen < 120 ? colors.yellow + ' ⚠️' : 
                            descLen > 160 ? colors.yellow + ' ⚠️' : 
                            colors.green + ' ✅';
          const truncatedDesc = descLen > 60 ? page.schemaDetails.description.substring(0, 60) + '...' : page.schemaDetails.description;
          console.log(colors.gray + '    📄 Description: "' + truncatedDesc + '" (' + descLen + ' chars)' + descStatus + colors.reset);
        }
        
        // Image
        if (page.schemaDetails.image) {
          const isDuplicate = results.ogImageUsage[page.schemaDetails.image] && 
                             results.ogImageUsage[page.schemaDetails.image].length > 1;
          const imageStatus = isDuplicate ? colors.yellow + ' ⚠️ dup' : '';
          console.log(colors.gray + '    🖼️  Image: ' + page.schemaDetails.image + imageStatus + colors.reset);
        } else if (page.hasGenerateSEO) {
          console.log(colors.red + '    🖼️  Image: Missing' + colors.reset);
        }
        
        // Other details (FAQs, products, etc.)
        const otherDetails = [];
        if (page.schemaDetails.faqs) {
          otherDetails.push(`${page.schemaDetails.faqs} FAQ(s)`);
        }
        if (page.schemaDetails.products) {
          otherDetails.push(`${page.schemaDetails.products} Product(s)`);
        }
        if (page.schemaDetails.services) {
          otherDetails.push(`${page.schemaDetails.services} Service(s)`);
        }
        if (page.schemaDetails.branches) {
          otherDetails.push(`${page.schemaDetails.branches} Branch(es)`);
        }
        if (page.schemaDetails.news) {
          otherDetails.push(`${page.schemaDetails.news} News Article(s)`);
        }
        
        if (otherDetails.length > 0) {
          console.log(colors.gray + '    📊 Other: ' + otherDetails.join(' | ') + colors.reset);
        }
      }
    });
    
    // Pages without SEO
    if (results.pagesWithoutSEO.length > 0) {
      console.log('\n' + colors.red + '❌ Pages missing SEO' + colors.reset + ` (${results.pagesWithoutSEO.length})`);
      results.pagesWithoutSEO.forEach(page => {
        console.log(colors.red + '  ✗ ' + page.path + colors.reset);
      });
    }
  }
  
  // Schema Summary
  if (results.pagesWithSEO.length > 0) {
    console.log('\n' + colors.blue + '📊 Schema Summary' + colors.reset);
    const allSchemas = {};
    let totalSchemaInstances = 0;
    
    results.pagesWithSEO.forEach(page => {
      page.schemas.forEach(schema => {
        // Extract base schema type (remove counts in parentheses)
        const baseSchema = schema.replace(/\s*\([^)]*\)/, '');
        if (!allSchemas[baseSchema]) {
          allSchemas[baseSchema] = { count: 0, pages: [] };
        }
        allSchemas[baseSchema].count++;
        allSchemas[baseSchema].pages.push(page.path);
        totalSchemaInstances++;
      });
    });
    
    console.log(colors.gray + `  Total schema instances: ${totalSchemaInstances} across ${Object.keys(allSchemas).length} schema types` + colors.reset);
    
    // Sort schemas by frequency
    const sortedSchemas = Object.entries(allSchemas).sort((a, b) => b[1].count - a[1].count);
    
    sortedSchemas.forEach(([schema, data]) => {
      const percentage = Math.round((data.count / results.pagesWithSEO.length) * 100);
      console.log(colors.gray + `  • ${schema}: ${data.count} pages (${percentage}%)` + colors.reset);
      if (data.count <= 3) { // Show page list for less common schemas
        console.log(colors.gray + `    └─ ${data.pages.join(', ')}` + colors.reset);
      }
    });
  }
  
  // Image Usage Analysis
  if (Object.keys(results.ogImageUsage).length > 0) {
    console.log('\n' + colors.blue + '🖼️  Image Usage Analysis' + colors.reset);
    
    // Check for pages without images
    if (results.pagesWithoutOGImage.length > 0) {
      console.log(colors.red + '  ❌ Pages without images: ' + results.pagesWithoutOGImage.join(', ') + colors.reset);
    } else {
      console.log(colors.green + '  ✅ All pages have images defined' + colors.reset);
    }
    
    // Check for duplicate images
    const duplicateImages = Object.entries(results.ogImageUsage)
      .filter(([image, pages]) => pages.length > 1)
      .sort((a, b) => b[1].length - a[1].length);
    
    if (duplicateImages.length > 0) {
      console.log(colors.yellow + '  ⚠️  Duplicate images detected:' + colors.reset);
      duplicateImages.forEach(([image, pages]) => {
        console.log(colors.gray + `    - "${image}" used by: ${pages.join(', ')} (${pages.length} pages)` + colors.reset);
      });
    }
    
    // Calculate unique image percentage
    const totalPagesWithImages = Object.values(results.ogImageUsage).flat().length;
    const uniqueImages = Object.keys(results.ogImageUsage).length;
    if (totalPagesWithImages > 0) {
      const uniquePercentage = Math.round((uniqueImages / totalPagesWithImages) * 100);
      console.log(colors.gray + `  📊 Unique images: ${uniqueImages}/${totalPagesWithImages} pages (${uniquePercentage}%)` + colors.reset);
    }
  }
  
  // Sitemap coverage
  if (config.sitemapFile) {
    console.log('\n' + colors.yellow + '📍 Sitemap Coverage' + colors.reset + ` (${results.sitemapPages.length} pages)`);
    if (results.sitemapPages.length > 0) {
      console.log(colors.gray + '  Listed: ' + results.sitemapPages.join(', ') + colors.reset);
    }
    
    // Find missing pages from sitemap
    const pagesNotInSitemap = results.pagesWithSEO
      .filter(page => {
        const pagePath = page.pageName === 'index' ? '' : page.pageName;
        return !results.sitemapPages.includes(pagePath) && 
               !config.ignorePaths.some(ignore => page.path.includes(ignore));
      })
      .map(page => page.pageName === 'index' ? '/' : '/' + page.pageName);
    
    if (pagesNotInSitemap.length > 0) {
      console.log(colors.yellow + '  Missing from sitemap: ' + pagesNotInSitemap.join(', ') + colors.reset);
    }
  }
  
  // Robots configuration
  console.log('\n' + colors.blue + '🤖 Robots Configuration' + colors.reset);
  if (results.robotsConfig) {
    if (results.robotsConfig.configured) {
      console.log(colors.green + '  ✓ ' + results.robotsConfig.message + colors.reset);
      if (results.robotsConfig.hasEnvironmentRules) {
        console.log(colors.gray + '    - Environment-based rules detected' + colors.reset);
      }
    } else {
      console.log(colors.red + '  ✗ ' + results.robotsConfig.message + colors.reset);
    }
  }
  
  // Warnings
  if (results.warnings.length > 0) {
    console.log('\n' + colors.yellow + '⚠️  Warnings' + colors.reset);
    results.warnings.forEach(warning => {
      console.log(colors.yellow + '  - ' + warning + colors.reset);
    });
  }
  
  // Errors
  if (results.errors.length > 0) {
    console.log('\n' + colors.red + '❌ Errors' + colors.reset);
    results.errors.forEach(error => {
      console.log(colors.red + '  - ' + error + colors.reset);
    });
  }
  
  // Recommendations
  if (totalPages > 0) {
    console.log('\n' + colors.bright + '📊 Recommendations:' + colors.reset);
    
    let recommendations = [];
    
    if (results.pagesWithoutSEO.length > 0) {
      recommendations.push('Add generateSEO() or useSeoMeta() to pages missing SEO implementation');
    }
    
    if (config.sitemapFile && results.pagesWithSEO.length > results.sitemapPages.length) {
      recommendations.push('Add missing pages to sitemap configuration');
    }
    
    // Schema-specific recommendations
    const allSchemas = {};
    results.pagesWithSEO.forEach(page => {
      page.schemas.forEach(schema => {
        const baseSchema = schema.replace(/\s*\([^)]*\)/, '');
        allSchemas[baseSchema] = (allSchemas[baseSchema] || 0) + 1;
      });
    });
    
    // Check for missing important schemas
    const hasProductPages = results.pagesWithSEO.some(p => p.path.includes('product'));
    const hasProductSchema = allSchemas['Product'] > 0;
    if (hasProductPages && !hasProductSchema) {
      recommendations.push('Consider adding Product schema for product-related pages');
    }
    
    // BreadcrumbList is optional but beneficial for navigation
    const hasBreadcrumb = allSchemas['BreadcrumbList'] > 0;
    if (!hasBreadcrumb && results.pagesWithSEO.length > 3) {
      recommendations.push('Consider adding BreadcrumbList schema for better navigation context in search results');
    }
    
    // Check for FAQ opportunities
    const hasFAQSchema = allSchemas['FAQPage'] > 0;
    if (!hasFAQSchema) {
      recommendations.push('Consider adding FAQ schema to relevant pages for rich snippets');
    }
    
    // Check for LocalBusiness schema
    const hasContactPages = results.pagesWithSEO.some(p => p.path.includes('contact'));
    const hasLocalBusiness = allSchemas['LocalBusiness'] > 0;
    if (hasContactPages && !hasLocalBusiness) {
      recommendations.push('Consider adding LocalBusiness schema to contact pages with branch information');
    }
    
    // Check schema coverage
    const schemaPerPage = Object.values(allSchemas).reduce((a, b) => a + b, 0) / results.pagesWithSEO.length;
    if (schemaPerPage < 3) {
      recommendations.push(`Average ${schemaPerPage.toFixed(1)} schemas per page - consider adding more structured data`);
    }
    
    if (!config.sitemapFile) {
      recommendations.push('Consider adding a sitemap for better SEO');
    }
    
    if (!results.robotsConfig || !results.robotsConfig.configured) {
      recommendations.push('Add robots configuration (@nuxtjs/robots or robots.txt)');
    }
    
    if (recommendations.length === 0) {
      recommendations.push('SEO implementation looks good! Consider adding more structured data types.');
    }
    
    recommendations.forEach((rec, index) => {
      console.log(colors.gray + `  ${index + 1}. ${rec}` + colors.reset);
    });
    
    // Meta Content Overview Table
    if (results.pagesWithSEO.length > 0) {
      console.log('\n' + colors.bright + '📊 Meta Content Overview:' + colors.reset);
      console.log(colors.gray + '━'.repeat(100) + colors.reset);
      console.log(colors.bright + 
        'Page'.padEnd(20) + '│ ' +
        'Title (len)'.padEnd(15) + '│ ' +
        'Description (len)'.padEnd(18) + '│ ' +
        'Image' + colors.reset
      );
      console.log(colors.gray + '━'.repeat(100) + colors.reset);
      
      results.pagesWithSEO.forEach(page => {
        if (page.schemaDetails) {
          const pageName = page.pageName.padEnd(20);
          
          // Title column
          let titleCol = '';
          if (page.schemaDetails.title) {
            const titleLen = page.schemaDetails.title.length;
            const titleShort = page.schemaDetails.title.length > 10 ? 
              page.schemaDetails.title.substring(0, 10) + '...' : 
              page.schemaDetails.title;
            const titleStatus = titleLen < 30 || titleLen > 60 ? '⚠️' : '✅';
            titleCol = `${titleShort} (${titleLen})${titleStatus}`.padEnd(15);
          } else {
            titleCol = 'Missing ❌'.padEnd(15);
          }
          
          // Description column
          let descCol = '';
          if (page.schemaDetails.description) {
            const descLen = page.schemaDetails.description.length;
            const descShort = page.schemaDetails.description.length > 12 ? 
              page.schemaDetails.description.substring(0, 12) + '...' : 
              page.schemaDetails.description;
            const descStatus = descLen < 120 || descLen > 160 ? '⚠️' : '✅';
            descCol = `${descShort} (${descLen})${descStatus}`.padEnd(18);
          } else {
            descCol = 'Missing ❌'.padEnd(18);
          }
          
          // Image column
          let imageCol = '';
          if (page.schemaDetails.image) {
            const imageName = page.schemaDetails.image.split('/').pop();
            const isDuplicate = results.ogImageUsage[page.schemaDetails.image] && 
                               results.ogImageUsage[page.schemaDetails.image].length > 1;
            const imageStatus = isDuplicate ? ' ⚠️dup' : '';
            imageCol = imageName + imageStatus;
          } else {
            imageCol = 'Missing ❌';
          }
          
          console.log(colors.gray + 
            pageName + '│ ' +
            titleCol + '│ ' +
            descCol + '│ ' +
            imageCol + colors.reset
          );
        }
      });
      
      console.log(colors.gray + '━'.repeat(100) + colors.reset);
    }
    
    // Quick Fixes
    console.log('\n' + colors.bright + 'Quick Fixes (High Impact):' + colors.reset);
    const quickFixes = [];
    
    // Prioritize fixes based on impact
    if (results.categoryScores.socialSharing.score < 10) {
      quickFixes.push(`Add Open Graph tags to all pages (impact: +${20 - results.categoryScores.socialSharing.score} points)`);
    }
    if (results.imageStats.totalImages > 0 && results.imageStats.imagesWithoutAlt > 0) {
      const potentialGain = Math.round((results.imageStats.imagesWithoutAlt / results.imageStats.totalImages) * 20);
      quickFixes.push(`Add alt text to ${results.imageStats.imagesWithoutAlt} images (impact: +${potentialGain} points)`);
    }
    if (results.categoryScores.metaTags.issues.some(i => i.includes('too short') || i.includes('too long'))) {
      quickFixes.push('Optimize title and description lengths (impact: +2-5 points)');
    }
    if (results.pagesWithoutSEO.length > 0) {
      quickFixes.push(`Add SEO to ${results.pagesWithoutSEO.length} pages (impact: +${results.pagesWithoutSEO.length * 2} points)`);
    }
    
    if (quickFixes.length === 0) {
      quickFixes.push('SEO implementation is well optimized! Consider adding more structured data types.');
    }
    
    quickFixes.slice(0, 3).forEach((fix, index) => {
      console.log(colors.gray + `  ${index + 1}. ${fix}` + colors.reset);
    });
    
    // Final Score Summary
    console.log('\n' + colors.bright + 'Final Assessment: ' + colors.reset + 
      (overallPercentage >= 90 ? colors.green + overallPercentage + '% - Excellent! 🎉' : 
       overallPercentage >= 70 ? colors.green + overallPercentage + '% - Good' :
       overallPercentage >= 50 ? colors.yellow + overallPercentage + '% - Needs Improvement' :
       colors.red + overallPercentage + '% - Poor') + colors.reset
    );
  }
  
  console.log('\n' + colors.bright + '=' + '='.repeat(40) + colors.reset + '\n');
  
  // Exit with error code if score is below threshold (for CI/CD)
  if (overallPercentage < 50 && process.env.CI) {
    process.exit(1);
  }
}

/**
 * Main execution
 */
async function main() {
  console.log(colors.blue + '🔍 Starting SEO check...' + colors.reset);
  console.log(colors.gray + `Project: ${config.projectName}` + colors.reset + '\n');
  
  // Check if pages directory exists
  if (!config.pagesDir) {
    console.error(colors.red + 'Error: Could not detect Nuxt project structure' + colors.reset);
    console.error(colors.gray + 'Make sure you run this command from a Nuxt project root' + colors.reset);
    process.exit(1);
  }
  
  console.log(colors.gray + `Pages directory: ${path.relative(projectRoot, config.pagesDir)}` + colors.reset);
  
  // Find all Vue files
  const vueFiles = findVueFiles(config.pagesDir);
  console.log(colors.gray + `Found ${vueFiles.length} page files` + colors.reset);
  
  // Check each page (now async)
  const pageResults = await Promise.all(vueFiles.map(file => checkPageSEO(file)));
  
  pageResults.forEach(result => {
    if (result) {
      if (result.hasSEO) {
        results.pagesWithSEO.push(result);
        
        // Track image parameter usage from generateSEO
        if (result.schemaDetails && result.schemaDetails.image) {
          const image = result.schemaDetails.image;
          if (!results.ogImageUsage[image]) {
            results.ogImageUsage[image] = [];
          }
          results.ogImageUsage[image].push(result.pageName);
        } else if (result.hasGenerateSEO) {
          // Page uses generateSEO but no image parameter
          results.pagesWithoutOGImage.push(result.pageName);
        }
      } else {
        results.pagesWithoutSEO.push(result);
      }
    }
  });
  
  // Check sitemap
  checkSitemap();
  
  // Check robots configuration
  checkRobotsConfig();
  
  // Generate report
  generateReport();
}

// Run the checker
main();