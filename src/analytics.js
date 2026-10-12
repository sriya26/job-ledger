import {today} from './model.js';
import {SUBMITTED_STAGES,addDays,dateRange,weekday,weekStart,dailyActivity,dailySeries,activitySummary,weekdayTotals,stageSummary,funnel,weeklyCohorts,responseTimes,topValues,niceMax} from './analytics-model.js';
import {$,el,stageClass} from './ui.js';
const RANGES=[[14,'2 weeks'],[30,'30 days'],[90,'90 days']];
const WEEKDAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const HEATMAP_WEEKS=53;
let records=[],range=30,selected=today(),openRecord=()=>{},showStage=()=>{};
const parse=date=>new Date(`${date}T12:00:00`);
const fmt=(date,options)=>parse(date).toLocaleDateString(undefined,options);
const longDate=date=>fmt(date,{weekday:'long',month:'long',day:'numeric'});
const shortDate=date=>fmt(date,{month:'short',day:'numeric'});
const plural=(n,word)=>`${n} ${word}${n===1?'':'s'}`;
const percent=(part,whole)=>whole?`${Math.round(part/whole*100)}%`:'—';
const stageKey=stage=>stage.toLowerCase().replace(/ /g,'-');
const SVG='http://www.w3.org/2000/svg';
function svg(tag,attributes={},...children){const node=document.createElementNS(SVG,tag);for(const [k,v] of Object.entries(attributes))node.setAttribute(k,v);node.append(...children);return node;}

export function updateAnalytics(next,handlers){records=next;openRecord=handlers.openRecord;showStage=handlers.showStage;renderDaily();renderStats();}

// One shared tooltip for every chart mark carrying data-tip (first line is the title).
const tip=el('div',{class:'viz-tip',role:'tooltip',hidden:true});
document.body.append(tip);
function showTip(target,x,y){
  const [title,...lines]=target.dataset.tip.split('\n');
  tip.replaceChildren(el('strong',{},title),...lines.map(line=>el('span',{},line)));tip.hidden=false;
  const {width,height}=tip.getBoundingClientRect();
  tip.style.left=`${Math.min(Math.max(8,x-width/2),innerWidth-width-8)}px`;
  tip.style.top=`${y-height-12<8?y+18:y-height-12}px`;
}
for(const id of ['#daily-view','#stats-view']){
  const host=$(id);
  host.addEventListener('pointermove',event=>{const target=event.target.closest?.('[data-tip]');if(target)showTip(target,event.clientX,event.clientY);else tip.hidden=true;});
  host.addEventListener('pointerleave',()=>{tip.hidden=true;});
  host.addEventListener('focusin',event=>{const target=event.target.closest('[data-tip]');if(!target)return;const box=target.getBoundingClientRect();showTip(target,box.left+box.width/2,box.top);});
  host.addEventListener('focusout',()=>{tip.hidden=true;});
}
const stageTip=stages=>SUBMITTED_STAGES.filter(s=>stages[s]).map(s=>`${s}: ${stages[s]}`);

function heading(eyebrow,title,description,...extra){return el('div',{class:'analytics-heading'},el('div',{},el('div',{class:'eyebrow'},eyebrow),el('h2',{},title),el('p',{class:'muted'},description)),...extra);}
function card(title,subtitle,body,className='',actions=null){return el('section',{class:`viz-card ${className}`},el('header',{class:'viz-card-head'},el('div',{},el('h3',{},title),subtitle?el('p',{},subtitle):null),actions),...[body].flat());}
function legend(stages,extra=[]){return el('div',{class:'viz-legend'},stages.map(stage=>el('span',{},el('i',{class:`swatch fill-${stageKey(stage)}`}),stage)),extra);}
function kpi({label,value,detail,swatch,meter,onclick}){
  return el(onclick?'button':'div',{class:'kpi',onclick},
    el('span',{class:'kpi-label'},swatch?el('i',{class:`swatch fill-${swatch}`}):null,label),
    el('strong',{class:'kpi-value'},value),
    detail?el('small',{},detail):null,
    meter!=null?el('div',{class:'kpi-meter','aria-hidden':'true'},el('span',{class:swatch?`fill-${swatch}`:'',style:`width:${Math.min(100,meter*100)}%`})):null);
}

// Stacked columns (one segment per current stage) with gridlines and an optional average line in the same unit.
function columnChart({columns,average,valueLabels,onSelect,label}){
  const peak=Math.max(0,...columns.map(c=>c.count),...(average||[])),max=niceMax(peak);
  const ticks=[0,max/2,max];
  const plot=el('div',{class:'col-plot'},ticks.map(t=>el('div',{class:'gridline',style:`bottom:${t/max*100}%`},el('span',{},t))));
  const bars=el('div',{class:'col-bars',role:'list','aria-label':label});
  const peakIndex=columns.findIndex(c=>c.count===peak&&peak>0);
  columns.forEach((column,i)=>{
    const stack=el('div',{class:'col-stack',style:`height:${column.count/max*100}%`},SUBMITTED_STAGES.filter(s=>column.stages[s]).map(s=>el('i',{class:`fill-${stageKey(s)}`,style:`flex-grow:${column.stages[s]}`})));
    const showValue=column.count&&(valueLabels==='all'||i===peakIndex);
    const node=el(onSelect?'button':'div',{class:`col${column.selected?' selected':''}${column.today?' is-today':''}`,role:'listitem','data-tip':column.tip,'aria-label':column.tip.replace(/\n/g,'. '),onclick:onSelect?()=>onSelect(column):null},
      el('div',{class:'col-area'},showValue?el('span',{class:'col-value',style:`bottom:${column.count/max*100}%`},column.count):null,stack),
      el('span',{class:'col-label'},column.label||''));
    bars.append(node);
  });
  plot.append(bars);
  if(average){
    const n=columns.length,points=average.map((v,i)=>`${(i+.5)/n*100},${100-v/max*100}`).join(' ');
    plot.append(svg('svg',{class:'avg-line',viewBox:'0 0 100 100',preserveAspectRatio:'none','aria-hidden':'true'},svg('polyline',{points,'vector-effect':'non-scaling-stroke'})));
    const last=average.at(-1);
    plot.append(el('span',{class:'avg-tag',style:`bottom:${last/max*100}%`},`${last.toFixed(1)}/day`));
  }
  return el('div',{class:'col-chart',style:`--count:${columns.length}`},plot);
}

function renderDaily(){
  const current=today(),{days,undated,future}=dailyActivity(records,current),summary=activitySummary(days,current);
  if(selected>current)selected=current;
  const series=dailySeries(days,current,range);
  const weekDelta=summary.week-summary.lastWeek;
  const kpis=el('div',{class:'kpi-row'},
    kpi({label:'Today',value:summary.today,detail:summary.today?(summary.today>=summary.average30&&summary.average30?'Above your 30-day pace':'Logged so far today'):'Nothing logged yet today'}),
    kpi({label:'Last 7 days',value:summary.week,detail:summary.lastWeek||summary.week?`${weekDelta>=0?'▲':'▼'} ${Math.abs(weekDelta)} vs the 7 days before`:'No applications this week'}),
    kpi({label:'Current streak',value:plural(summary.current,'day'),detail:`Longest: ${plural(summary.longest,'day')}`}),
    kpi({label:'Daily average',value:summary.average30.toFixed(1),detail:'Over the last 30 days'}),
    kpi({label:'Best day',value:summary.best?.count||0,detail:summary.best?shortDate(summary.best.date)+(summary.best.date.slice(0,4)!==current.slice(0,4)?`, ${summary.best.date.slice(0,4)}`:''):'—'}));

  const columns=series.map(day=>({date:day.date,count:day.count,stages:day.stages,selected:day.date===selected,today:day.date===current,
    label:range===14?fmt(day.date,{day:'numeric'}):range===30?(weekday(day.date)===0?shortDate(day.date):''):(day.date.endsWith('-01')?fmt(day.date,{month:'short'}):''),
    tip:[`${longDate(day.date)} · ${plural(day.count,'application')}`,...stageTip(day.stages),`7-day average: ${day.average.toFixed(1)}`].join('\n')}));
  const rangeControl=el('div',{class:'segmented',role:'group','aria-label':'Date range'},RANGES.map(([value,label])=>el('button',{'aria-pressed':String(value===range),onclick:()=>{range=value;renderDaily();}},label)));
  const present=SUBMITTED_STAGES.filter(s=>series.some(d=>d.stages[s]));
  const perDay=card('Applications per day',`Last ${RANGES.find(r=>r[0]===range)[1]} · ${plural(series.reduce((a,d)=>a+d.count,0),'application')} · colored by where each one stands now`,
    [legend(present,el('span',{},el('i',{class:'swatch line'}),'7-day average')),
     columnChart({columns,average:series.map(d=>d.average),valueLabels:range===14?'all':'peak',label:'Applications per day',onSelect:column=>{selected=column.date;renderDaily();}})],'span-2');

  const dayList=days.get(selected)||[];
  const dayNav=el('div',{class:'day-nav'},el('button',{class:'quiet','aria-label':'Previous day',onclick:()=>{selected=addDays(selected,-1);renderDaily();}},'←'),el('button',{class:'quiet','aria-label':'Next day',disabled:selected>=current,onclick:()=>{selected=addDays(selected,1);renderDaily();}},'→'));
  const log=card(longDate(selected),`${plural(dayList.length,'application')}${selected===current?' · today':''}`,[
    dayList.length?el('div',{class:'activity-list'},dayList.map(record=>el('button',{class:'activity-job',onclick:()=>openRecord(record)},el('div',{},el('strong',{},record.company||'Company not set'),el('span',{},record.position||'Position not set')),el('span',{class:`status-pill ${stageClass(record.stage)}`},record.stage))))
      :el('p',{class:'viz-empty'},selected===current?'Nothing logged today yet. Your next one starts the count.':'No applications on this day.')],'day-log',dayNav);

  const heatmap=renderHeatmap(days,current);
  const totals=weekdayTotals(days),topDay=totals.indexOf(Math.max(...totals)),weekdayMax=Math.max(1,...totals);
  const rhythm=card('Weekly rhythm','Total applications by day of the week',el('div',{class:'hbars'},WEEKDAYS.map((name,i)=>el('div',{class:`hbar${i===topDay&&totals[i]?' top':''}`,'data-tip':`${name} · ${plural(totals[i],'application')}\n${percent(totals[i],totals.reduce((a,b)=>a+b,0))} of all applications`},
    el('span',{class:'hbar-label'},name),el('div',{class:'hbar-track'},el('span',{class:'fill-applied',style:`width:${totals[i]/weekdayMax*100}%`})),el('span',{class:'hbar-value'},totals[i])))));

  $('#daily-view').replaceChildren(
    heading('ONE DAY AT A TIME','Your application rhythm','How many applications you send each day, and how they’re doing.',rangeControl),
    kpis,
    el('div',{class:'viz-grid'},perDay,log,heatmap,rhythm),
    el('p',{class:'analytics-footnote'},`Counts use applied dates and exclude “To apply” jobs. Applications later rejected or withdrawn still count on the day you sent them.${undated?` ${plural(undated,'submitted record')} without a valid applied date ${undated===1?'is':'are'} not shown.`:''}${future?` ${plural(future,'future-dated record')} ${future===1?'is':'are'} excluded.`:''}`));
}

function renderHeatmap(days,current){
  const first=addDays(weekStart(current),-7*(HEATMAP_WEEKS-1)),dates=dateRange(addDays(weekStart(current),6),HEATMAP_WEEKS*7);
  const peak=Math.max(1,...dates.map(d=>d<=current?days.get(d)?.length||0:0));
  let yearTotal=0;
  const grid=el('div',{class:'heatmap-grid'});
  const months=el('div',{class:'heatmap-months'});
  for(let w=0;w<HEATMAP_WEEKS;w++){
    const start=addDays(first,w*7),firstOfMonth=dateRange(addDays(start,6),7).find(d=>d.endsWith('-01'));
    months.append(el('span',{},firstOfMonth?fmt(firstOfMonth,{month:'short'}):''));
  }
  for(const date of dates){
    if(date>current){grid.append(el('i',{class:'cell future'}));continue;}
    const n=days.get(date)?.length||0;yearTotal+=n;
    grid.append(el('i',{class:`cell level-${n?Math.ceil(n/peak*4):0}${date===selected?' selected':''}`,'data-date':date,'data-tip':`${plural(n,'application')}\n${longDate(date)}, ${date.slice(0,4)}`}));
  }
  grid.addEventListener('click',event=>{const date=event.target.dataset?.date;if(date){selected=date;renderDaily();}});
  const scroller=el('div',{class:'heatmap-scroll'},el('div',{class:'heatmap'},el('div',{class:'heatmap-days','aria-hidden':'true'},WEEKDAYS.map((d,i)=>el('span',{},i%2?'':d))),el('div',{},months,grid)));
  requestAnimationFrame(()=>{scroller.scrollLeft=scroller.scrollWidth;});
  return card('The past year',`${plural(yearTotal,'application')} in the last 12 months · select a day to see it`,[scroller,
    el('div',{class:'heatmap-legend','aria-hidden':'true'},'Less',[0,1,2,3,4].map(i=>el('i',{class:`cell level-${i}`})),'More')],'span-2 heatmap-card');
}

function renderStats(){
  const current=today(),summary=stageSummary(records),{counts,submitted,inProcess}=summary,{days}=dailyActivity(records,current);
  const kpis=el('div',{class:'kpi-row six'},
    kpi({label:'Submitted',value:submitted,detail:`${counts['To apply']} saved to apply later`,onclick:()=>showStage('')}),
    kpi({label:'Awaiting reply',value:counts.Applied,detail:`${percent(counts.Applied,submitted)} of submitted`,swatch:'applied',meter:submitted?counts.Applied/submitted:0,onclick:()=>showStage('Applied')}),
    kpi({label:'In process',value:inProcess,detail:`${counts.Assessment} assessment · ${counts.Interview} interview`,swatch:'interview',meter:submitted?inProcess/submitted:0,onclick:()=>showStage('in-process')}),
    kpi({label:'Offers',value:counts.Offer,detail:`${percent(counts.Offer,submitted)} of submitted`,swatch:'offer',meter:submitted?counts.Offer/submitted:0,onclick:()=>showStage('Offer')}),
    kpi({label:'Rejected',value:counts.Rejected,detail:`${percent(counts.Rejected,submitted)} of submitted`,swatch:'rejected',meter:submitted?counts.Rejected/submitted:0,onclick:()=>showStage('Rejected')}),
    kpi({label:'Response rate',value:percent(summary.responded,submitted),detail:`${summary.responded} of ${submitted} heard back`,meter:summary.responseRate}));

  // Waffle: every submitted application is one square, grouped by stage, oldest first.
  const submittedRecords=records.filter(r=>r.stage!=='To apply').sort((a,b)=>SUBMITTED_STAGES.indexOf(a.stage)-SUBMITTED_STAGES.indexOf(b.stage)||(a.appliedDate||'').localeCompare(b.appliedDate||''));
  const size=submittedRecords.length>400?'xs':submittedRecords.length>150?'sm':'';
  const waffle=el('div',{class:`waffle ${size}`,role:'img','aria-label':`${submitted} submitted applications: ${SUBMITTED_STAGES.map(s=>`${s} ${counts[s]}`).join(', ')}`},submittedRecords.map(record=>el('i',{class:`fill-${stageKey(record.stage)}`,'data-id':record.id,'data-tip':`${record.company||'Company not set'}\n${record.position||'Position not set'}\n${record.stage}${record.appliedDate?` · applied ${shortDate(record.appliedDate)}`:''}`})));
  waffle.addEventListener('click',event=>{const record=records.find(r=>r.id===event.target.dataset?.id);if(record)openRecord(record);});
  const waffleLegend=el('div',{class:'viz-legend stacked'},SUBMITTED_STAGES.map(stage=>el('button',{class:'legend-item',onclick:()=>showStage(stage),disabled:!counts[stage]},el('i',{class:`swatch fill-${stageKey(stage)}`}),el('span',{},stage),el('strong',{},counts[stage]),el('small',{},percent(counts[stage],submitted)))));
  const pipeline=card('Every application, at a glance','One square per application · hover for details, click to open',submitted?[waffle,waffleLegend]:el('p',{class:'viz-empty'},'Mark an application as Applied to start filling this in.'),'span-2');

  const steps=funnel(records);
  const progress=card('How far they’ve gotten','Share of submitted applications that reached each step',el('div',{class:'funnel'},steps.map((step,i)=>el('div',{class:'funnel-step','data-tip':`${step.label} · ${step.count}\n${percent(step.count,submitted)} of submitted${i?`\n${percent(step.count,steps[i-1].count)} of “${steps[i-1].label}”`:''}`},
    el('div',{class:'funnel-text'},el('span',{},step.label),el('strong',{},step.count),el('small',{},percent(step.count,submitted))),
    el('div',{class:'funnel-track'},el('span',{style:`width:${submitted?step.count/submitted*100:0}%`}))))));

  const weeks=weeklyCohorts(days,current,12);
  const cohortChart=card('Each week’s applications, today','Applications sent per week, colored by where they stand now',[legend(SUBMITTED_STAGES.filter(s=>weeks.some(w=>w.stages[s]))),
    columnChart({columns:weeks.map((week,i)=>({count:week.count,stages:week.stages,today:i===weeks.length-1,label:i%2===weeks.length%2?'':shortDate(week.start),tip:[`Week of ${shortDate(week.start)} · ${plural(week.count,'application')}`,...stageTip(week.stages)].join('\n')})),valueLabels:'all',label:'Applications per week'})],'span-2');

  const waits=responseTimes(records),waitMax=Math.max(1,...waits.buckets.map(b=>b.count));
  const timing=card('Time to hear back',waits.count?`From ${plural(waits.count,'application')} with a response date`:'Uses applied and response dates',waits.count?[
    el('div',{class:'hero-stat'},el('strong',{},`${Math.round(waits.median)}`),el('span',{},`median ${Math.round(waits.median)===1?'day':'days'} to a response`)),
    el('div',{class:'hbars wide-labels'},waits.buckets.map(b=>el('div',{class:'hbar','data-tip':`${b.label} · ${plural(b.count,'response')}`},el('span',{class:'hbar-label'},b.label),el('div',{class:'hbar-track'},el('span',{class:'fill-interview',style:`width:${b.count/waitMax*100}%`})),el('span',{class:'hbar-value'},b.count))))]
    :el('p',{class:'viz-empty'},'Add a response date when a company replies to see how long they take.'));

  const places=topValues(records,'location',5),placeMax=Math.max(1,...places.items.map(p=>p.count));
  const locations=card('Where you’re applying','Top locations among submitted applications',places.items.length?el('div',{class:'hbars wide-labels'},[...places.items,...(places.others?[{label:'Everywhere else',count:places.others,other:true}]:[])].map(p=>el('div',{class:'hbar','data-tip':`${p.label} · ${plural(p.count,'application')}\n${percent(p.count,submitted)} of submitted`},el('span',{class:'hbar-label',title:p.label},p.label),el('div',{class:'hbar-track'},el('span',{class:p.other?'fill-other':'fill-applied',style:`width:${p.count/placeMax*100}%`})),el('span',{class:'hbar-value'},p.count))))
    :el('p',{class:'viz-empty'},'Add job locations to see where you’re applying.'));

  $('#stats-view').replaceChildren(
    heading('THE BIG PICTURE','Where things stand','Your whole search in one view. Select any stage to see those applications.'),
    kpis,
    el('div',{class:'viz-grid'},pipeline,progress,cohortChart,el('div',{class:'viz-stack'},timing,locations)),
    el('p',{class:'analytics-footnote'},'Stages show where each application is now. Because the stage a rejection came at isn’t recorded, rejected applications count as “heard back” but not as reaching later steps. “Response rate” counts any stage past Applied, or a response date. Table filters don’t affect these views.'));
}
