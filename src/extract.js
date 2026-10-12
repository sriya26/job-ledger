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
  const source = /(^|\.)greenhouse\.(io|eu)$/.test(host) ? 'Greenhouse' : /(^|\.)lever\.co$/.test(host) ? 'Lever' : /(^|\.)(myworkdayjobs|myworkdaysite)\.com$/.test(host) ? 'Workday' : /(^|\.)linkedin\.com$/.test(host) ? 'LinkedIn' : host;
  const selectors = {
    Greenhouse: {position:'.job__title h1, h1.job__title, h1.app-title, #header h1, main h1, h1', company:'.company-name, [data-testid="company-name"]', location:'.location, [data-testid="job-location"]'},
    Lever: {position:'.posting-headline h2', company:'.main-header-logo img', location:'.posting-categories .location'},
    Workday: {position:'[data-automation-id="jobPostingHeader"]', company:'[data-automation-id="companyName"]', location:'[data-automation-id="locations"]'},
    LinkedIn: {position:'.job-details-jobs-unified-top-card__job-title h1, .top-card-layout__title', company:'.job-details-jobs-unified-top-card__company-name, .topcard__org-name-link', location:'.job-details-jobs-unified-top-card__primary-description-container .tvm__text, .topcard__flavor--bullet'}
  };
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
  if (!position && rule.position) position = text(rule.position);
  if (!company && rule.company) company = source === 'Lever' ? clean(document.querySelector(rule.company)?.alt) : text(rule.company);
  if (!jobLocation && rule.location) jobLocation = text(rule.location);
  if (greenhouseTitle) {
    if (!position || /^(apply|apply for (this|the) (job|position)|application|job application|apply now)$/i.test(position)) position = clean(greenhouseTitle[1]);
    if (!company) company = clean(greenhouseTitle[2]);
  }
  company = company.replace(/^at\s+/i,'').replace(/\s+logo$/i,'');
  if (!job?.hiringOrganization && !greenhouseTitle && /^(lever|greenhouse|workday|linkedin|logo)$/i.test(company)) company = '';
  if (!position) position = text('[itemprop="title"], main h1, article h1, h1') || meta('og:title');
  if (/^(apply|application|careers|jobs|job application|apply now)$/i.test(position)) position = '';
  if (!company) company = text('[itemprop="hiringOrganization"] [itemprop="name"], [data-testid="company-name"], .job-company');
  if (!jobLocation) jobLocation = text('[itemprop="jobLocation"], [data-testid="job-location"], .job-location');
  let jobId = clean(typeof job?.identifier === 'string' ? job.identifier : job?.identifier?.value);
  if (!jobId) {
    if (source === 'Greenhouse') jobId = url.searchParams.get('gh_jid') || url.searchParams.get('token') || url.pathname.match(/\/jobs\/(\d+)/)?.[1] || '';
    else if (source === 'Lever') jobId = url.pathname.match(/\/([a-f0-9-]{36})(?:\/|$)/i)?.[1] || '';
    else if (source === 'LinkedIn') jobId = url.searchParams.get('currentJobId') || url.pathname.match(/\/view\/(?:.*-)?(\d+)/)?.[1] || '';
    else if (source === 'Workday') jobId = text('[data-automation-id="requisitionId"]').replace(/^Job Requisition ID\s*/i,'') || url.pathname.match(/_([^/]+)(?:\/apply)?$/)?.[1] || '';
  }
  const missing = [['company',company],['position',position],['location',jobLocation]].filter(([,v]) => !v).map(([k]) => k);
  return {embeddedGreenhouse,company,position,location:jobLocation,jobUrl:location.href,source,jobId:clean(jobId),review:missing.length ? `Please add or check: ${missing.join(', ')}.` : 'Review the captured details before saving.', method:job ? 'Structured job information' : rule.position ? `${source} page` : 'Page headings', multiple:jobs.length>1 && !job};
}
