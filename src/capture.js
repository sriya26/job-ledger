// Match embedded jobs by ID; never substitute another frame's job or the host page's heading.
export function selectEmbeddedJob(outer, results) {
  const expected = new Set(outer.embeddedGreenhouse.map(frame=>frame.jobId));
  const requested = new URL(outer.jobUrl).searchParams.get('gh_jid');
  const matches = results.filter(result=>result?.source==='Greenhouse' && expected.has(result.jobId) && (!requested || requested===result.jobId) && result.position);
  const unique = [...new Map(matches.map(result=>[result.jobId,result])).values()];
  if (unique.length!==1) throw new Error('The embedded job is still loading or could not be identified. Wait for the application to appear, then capture again.');
  return {...unique[0],jobUrl:outer.jobUrl,embeddedGreenhouse:[],method:'Embedded Greenhouse application'};
}
