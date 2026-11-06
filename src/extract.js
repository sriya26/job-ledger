// Self-contained: Chrome serializes this function into the active page's isolated world.
export function extractJob() {
  const clean = value => typeof value === 'string' ? value.replace(/\s+/g,' ').trim().slice(0,3000) : '';
  const text = selector => { for (const el of document.querySelectorAll(selector)) { if (el.getClientRects().length) { const value = clean(el.innerText || el.textContent); if (value) return value; } } return ''; };
  const meta = name => clean(document.querySelector(`meta[property="${name}"],meta[name="${name}"]`)?.content);
  const jobs = [];
  function walk(value, depth=0) {
    if (!value || typeof value !== 'object' || depth > 20) return;
    if (Array.isArray(value)) { value.forEach(v => walk(v,depth+1)); return; }
    if ([value['@type']].flat().some(t => /(^|[/#])JobPosting$/.test(t || ''))) jobs.push(value);
    for (const [key,v] of Object.entries(value)) if (key !== '@context' && typeof v === 'object') walk(v,depth+1);
  }
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) { try { walk(JSON.parse(script.textContent)); } catch {} }
  const url = new URL(location.href), host = url.hostname;
  const embeddedGreenhouse = [...document.querySelectorAll('iframe[src]')].map(frame => {
    try {
      const frameUrl = new URL(frame.getAttribute('src'),location.href);
      if (frameUrl.protocol !== 'https:' || !/^(boards|job-boards)\.greenhouse\.(io|eu)$/.test(frameUrl.hostname)) return null;
      const id = frameUrl.searchParams.get('token') || frameUrl.searchParams.get('gh_jid') || frameUrl.pathname.match(/\/jobs\/(\d+)/)?.[1] || '';
      if (!id) return null;
      return {origin:frameUrl.origin+'/*',jobId:id};
    } catch { return null; }
  }).filter(Boolean);
  // Split-pane boards (LinkedIn, Handshake) rename their markup often, so read the layout of the detail pane:
  // the job title is the largest text, the company sits just above it, and the location follows below.
  function layoutJob(companyLinks) {
    if (typeof getComputedStyle !== 'function') return {};
    const skip = 'nav, [role="navigation"], [role="banner"], [role="dialog"], [aria-modal="true"], select, input, textarea, [aria-hidden="true"]';
    const blocks = [];
    for (const node of document.body.querySelectorAll('*')) {
      if (![...node.childNodes].some(child => child.nodeType === 3 && child.textContent.trim()) || node.closest(skip)) continue;
      const box = node.getBoundingClientRect(), style = getComputedStyle(node);
      if (box.width <= 2 || box.height <= 2 || style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
      const value = clean(node.innerText).replace(/^[✓✔]\s*/,'');
      // Text in controls can still name the company (a clickable employer name), never the title or location.
      if (value && value.length <= 160) blocks.push({node, value, box, size:parseFloat(style.fontSize) || 0, weight:Number(style.fontWeight) || 400, control:!!node.closest('button, label, [role="button"]')});
    }
    const content = blocks.filter(b => !b.control);
    const largest = Math.max(0, ...content.filter(b => /[a-z]/i.test(b.value)).map(b => b.size));
    if (largest < 16) return {};
    const title = content.filter(b => b.size >= largest*0.92 && /[a-z]/i.test(b.value)).sort((a,b) => a.box.top-b.box.top)[0];
    const column = box => box.left >= title.box.left-120 && box.left < title.box.right;
    const above = box => box.bottom <= title.box.top+4 && title.box.top-box.bottom < 200 && column(box);
    // A company link can hold the name and a subtitle ("Aven" over "Financial Services"); the name is its first line.
    const link = [...document.querySelectorAll(companyLinks)].map(node => ({node, value:clean((node.innerText || '').split('\n').find(line => line.trim()) || ''), box:node.getBoundingClientRect()})).filter(b => b.value && above(b.box)).sort((a,b) => b.box.bottom-a.box.bottom)[0];
    // The employer name leads its block, above details like the industry ("Numeric" over "Internet & Software").
    const named = blocks.filter(b => above(b.box) && !/^(promoted|premium|new|verified|featured|follow|save|share|apply|\d.*)$/i.test(b.value)).sort((a,b) => b.weight-a.weight || b.size-a.size || a.box.top-b.box.top)[0];
    let place = '', workplace = '';
    for (const block of content.filter(b => b.box.top >= title.box.bottom-2 && b.box.top-title.box.bottom < 700 && column(b.box)).sort((a,b) => a.box.top-b.box.top)) {
      const mode = block.value.match(/^(Onsite|On-site|Hybrid|Remote)(?:,?\s+based in\s+(.+))?$/i);
      if (mode) { if (mode[2]) place ||= `${clean(mode[2])} (${mode[1]})`; else workplace ||= mode[1]; continue; }
      place ||= block.value.split(/\s*[·•∙]\s*/).find(part => /^[A-Z][\w .'’-]+,\s*[A-Z]{2}\b|^(Remote|United States)\b|,\s*(United States|USA|Canada|United Kingdom|India)$/.test(part)) || '';
      if (place && workplace) break;
    }
    return {position:title.value, company:link?.value || named?.value || '', location:place && workplace && !place.includes('(') ? `${place} (${workplace})` : place || workplace, titleNode:title.node};
  }
  function paneJob(id) {
    const visible = node => node?.getClientRects().length;
    const read = node => visible(node) ? clean(node.innerText || node.textContent) : '';
    const first = (selector, root=document) => { for (const node of root.querySelectorAll(selector)) { const value = read(node); if (value) return value; } return ''; };
    const workplace = value => /\((Remote|Hybrid|On-?site)\)/i.test(value);
    const found = {position:'',company:'',location:''};
    if (source === 'LinkedIn') {
      for (const button of document.querySelectorAll('button[aria-label], a[aria-label]')) {
        const match = visible(button) && clean(button.getAttribute('aria-label')).match(/^(?:Easy )?Apply to (.+) at (.+?)(?: on company website)?$/i);
        if (match) { found.position = match[1]; found.company = match[2]; break; }
      }
      found.position ||= first('.job-details-jobs-unified-top-card__job-title h1, .job-details-jobs-unified-top-card__job-title, .jobs-unified-top-card__job-title, .top-card-layout__title');
      found.company ||= first('.job-details-jobs-unified-top-card__company-name a, .job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name, .topcard__org-name-link');
      found.location = first('.job-details-jobs-unified-top-card__primary-description-container .tvm__text, .job-details-jobs-unified-top-card__tertiary-description-container .tvm__text, .jobs-unified-top-card__bullet, .topcard__flavor--bullet');
    }
    const layout = layoutJob('a[href*="/company/"], a[href*="/e/"], a[href*="/employers/"]');
    found.position ||= layout.position || ''; found.company ||= layout.company || ''; found.location ||= layout.location || '';
    found.id = id || layout.titleNode?.closest('a[href]')?.getAttribute('href').match(/\/jobs\/(?:view\/)?(\d+)/)?.[1] || '';
    if (source === 'LinkedIn' && found.id) {
      const link = [...document.querySelectorAll(`a[href*="/jobs/view/${found.id}"], a[href*="currentJobId=${found.id}"]`)].find(visible);
      const card = document.querySelector(`[data-job-id="${found.id}"], [data-occludable-job-id="${found.id}"]`) || link?.closest('li, [data-view-name="job-card"]');
      if (card) {
        const titleLink = card.querySelector('.job-card-list__title--link, .job-card-container__link, a[href*="/jobs/view/"]');
        const title = clean(titleLink?.getAttribute('aria-label') || read(titleLink) || first('.job-card-list__title', card)).replace(/\s+with verification$/i,'');
        // Unlabelled cards list title, company, then location as separate lines.
        const lines = [...new Set((card.innerText || '').split('\n').map(line => clean(line).replace(/\s+with verification$/i,'')).filter(Boolean))];
        const titleIndex = Math.max(0, lines.indexOf(title || found.position));
        const fromCard = {
          position: title || lines[titleIndex] || '',
          company: first('.artdeco-entity-lockup__subtitle, .job-card-container__primary-description, .job-card-container__company-name', card) || lines[titleIndex+1] || '',
          location: first('.artdeco-entity-lockup__caption, .job-card-container__metadata-wrapper li, .job-card-container__metadata-item', card) || lines[titleIndex+2] || ''
        };
        found.position ||= fromCard.position; found.company ||= fromCard.company;
        // Cards include the workplace type, e.g. "Los Angeles, CA (Remote)".
        if (!found.location || (!workplace(found.location) && workplace(fromCard.location))) found.location = fromCard.location;
      }
    }
    return found;
  }
  const source = /(^|\.)greenhouse\.(io|eu)$/.test(host) ? 'Greenhouse' : /(^|\.)lever\.co$/.test(host) ? 'Lever' : /(^|\.)(myworkdayjobs|myworkdaysite)\.com$/.test(host) ? 'Workday' : /(^|\.)linkedin\.com$/.test(host) ? 'LinkedIn' : /(^|\.)joinhandshake\.com$/.test(host) ? 'Handshake' : host;
  const selectors = {
    Greenhouse: {position:'.job__title h1, h1.job__title, h1.app-title, #header h1, main h1, h1', company:'.company-name, [data-testid="company-name"]', location:'.location, [data-testid="job-location"]'},
    Lever: {position:'.posting-headline h2', company:'.main-header-logo img', location:'.posting-categories .location'},
    Workday: {position:'[data-automation-id="jobPostingHeader"]', company:'[data-automation-id="companyName"]', location:'[data-automation-id="locations"]'},
  };
  const urlJobId = source === 'LinkedIn' ? url.searchParams.get('currentJobId') || url.pathname.match(/\/view\/(?:.*-)?(\d+)/)?.[1] || ''
    : source === 'Handshake' ? url.pathname.match(/\/(?:jobs|job-search)\/(\d+)/)?.[1] || url.searchParams.get('jobId') || '' : '';
  const pane = ['LinkedIn','Handshake'].includes(source) ? paneJob(urlJobId) : null;
  // Search pages carry the selected job only in the query; save its permanent page instead.
  const paneUrl = pane?.id ? (source === 'LinkedIn' ? `https://www.linkedin.com/jobs/view/${pane.id}/` : `${url.origin}/jobs/${pane.id}`) : '';
  const rule = selectors[source] || {};
  // Modern Greenhouse boards may omit a company label and use a generic form heading.
  // Their document/OG title carries the explicit role and employer instead.
  const greenhouseTitle = source === 'Greenhouse'
    ? [clean(document.title || document.querySelector('title')?.textContent), meta('og:title'), meta('twitter:title')].map(value => value.match(/^Job Application for (.+) at (.+)$/i)).find(Boolean)
    : null;
  // Only choose a structured posting when unambiguous or tied to this URL.
  const job = jobs.length === 1 ? jobs[0] : jobs.find(j => typeof j.url === 'string' && j.url === location.href);
  let company = clean(typeof job?.hiringOrganization === 'string' ? job.hiringOrganization : job?.hiringOrganization?.name);
  let position = clean(job?.title), jobLocation = '';
  const locations = [job?.jobLocation].flat().filter(Boolean).map(l => {
    if (typeof l === 'string') return clean(l);
    const a = l.address || l;
    return [a.addressLocality,a.addressRegion,typeof a.addressCountry === 'object' ? a.addressCountry.name : a.addressCountry].filter(v => typeof v === 'string').join(', ');
  }).filter(Boolean);
  jobLocation = [...new Set(locations)].join(' / ');
  if (job?.jobLocationType === 'TELECOMMUTE') jobLocation = jobLocation ? `Remote · ${jobLocation}` : 'Remote';
  // These boards swap jobs without reloading, so embedded job data can describe a previously opened job.
  if (pane) { position = pane.position || position; company = pane.company || company; jobLocation = pane.location || jobLocation; }
  if (!position && rule.position) position = text(rule.position);
  if (!company && rule.company) company = source === 'Lever' ? clean(document.querySelector(rule.company)?.alt) : text(rule.company);
  if (!jobLocation && rule.location) jobLocation = text(rule.location);
  if (greenhouseTitle) {
    if (!position || /^(apply|apply for (this|the) (job|position)|application|job application|apply now)$/i.test(position)) position = clean(greenhouseTitle[1]);
    if (!company) company = clean(greenhouseTitle[2]);
  }
  company = company.replace(/^at\s+/i,'').replace(/\s+logo$/i,'');
  if (!job?.hiringOrganization && !greenhouseTitle && /^(lever|greenhouse|workday|linkedin|handshake|logo)$/i.test(company)) company = '';
  // Split-pane page headings and titles describe the search, not the selected job.
  if (!position && !pane) position = text('[itemprop="title"], main h1, article h1, h1') || meta('og:title');
  if (/^(apply|application|careers|jobs|job application|apply now)$/i.test(position)) position = '';
  if (!company) company = text('[itemprop="hiringOrganization"] [itemprop="name"], [data-testid="company-name"], .job-company');
  if (!jobLocation) jobLocation = text('[itemprop="jobLocation"], [data-testid="job-location"], .job-location');
  let jobId = pane?.id || clean(typeof job?.identifier === 'string' ? job.identifier : job?.identifier?.value);
  if (!jobId) {
    if (source === 'Greenhouse') jobId = url.searchParams.get('gh_jid') || url.searchParams.get('token') || url.pathname.match(/\/jobs\/(\d+)/)?.[1] || '';
    else if (source === 'Lever') jobId = url.pathname.match(/\/([a-f0-9-]{36})(?:\/|$)/i)?.[1] || '';
    else if (pane) jobId = pane.id;
    else if (source === 'Workday') jobId = text('[data-automation-id="requisitionId"]').replace(/^Job Requisition ID\s*/i,'') || url.pathname.match(/_([^/]+)(?:\/apply)?$/)?.[1] || '';
  }
  const missing = [['company',company],['position',position],['location',jobLocation]].filter(([,v]) => !v).map(([k]) => k);
  return {embeddedGreenhouse,company,position,location:jobLocation,jobUrl:paneUrl || location.href,source,jobId:clean(jobId),review:missing.length ? `Please add or check: ${missing.join(', ')}.` : 'Review the captured details before saving.', method:pane ? `${source} job` : job ? 'Structured job information' : rule.position ? `${source} page` : 'Page headings', multiple:jobs.length>1 && !job};
}
