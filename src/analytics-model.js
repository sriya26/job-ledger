import {STAGES,validDate} from './model.js';
// Applied dates are local calendar strings; do date math in UTC so DST never shifts a day.
const DAY=86400000;
const toMs=date=>Date.UTC(+date.slice(0,4),+date.slice(5,7)-1,+date.slice(8,10));
export const addDays=(date,n)=>new Date(toMs(date)+n*DAY).toISOString().slice(0,10);
export const daysBetween=(from,to)=>Math.round((toMs(to)-toMs(from))/DAY);
export const weekday=date=>(new Date(toMs(date)).getUTCDay()+6)%7; // Monday = 0
export const weekStart=date=>addDays(date,-weekday(date));
export const dateRange=(end,count)=>Array.from({length:count},(_,i)=>addDays(end,i-count+1));
export const SUBMITTED_STAGES=STAGES.filter(stage=>stage!=='To apply');
const RESPONDED=['Assessment','Interview','Offer','Rejected'];
const byStage=list=>{const counts=Object.fromEntries(SUBMITTED_STAGES.map(stage=>[stage,0]));for(const record of list)if(Object.hasOwn(counts,record.stage))counts[record.stage]++;return counts;};

export function dailyActivity(records,today){
  const days=new Map();let undated=0,future=0;
  for(const record of records){
    if(record.stage==='To apply')continue;
    if(!record.appliedDate || !validDate(record.appliedDate)){undated++;continue;}
    if(record.appliedDate>today){future++;continue;}
    if(!days.has(record.appliedDate))days.set(record.appliedDate,[]);
    days.get(record.appliedDate).push(record);
  }
  return {days,undated,future};
}
const countOn=(days,date)=>days.get(date)?.length||0;
// One entry per day ending today, with a trailing 7-day average that also looks back before the range.
export function dailySeries(days,today,length){
  return dateRange(today,length).map(date=>{
    const list=days.get(date)||[],week=dateRange(date,7).reduce((sum,d)=>sum+countOn(days,d),0);
    return {date,count:list.length,records:list,stages:byStage(list),average:week/7};
  });
}
export function streaks(days,today){
  let current=0,date=countOn(days,today)?today:addDays(today,-1); // today still counts as "in progress"
  while(countOn(days,date)){current++;date=addDays(date,-1);}
  let longest=0,run=0,previous=null;
  for(const d of [...days.keys()].sort()){run=previous&&daysBetween(previous,d)===1?run+1:1;longest=Math.max(longest,run);previous=d;}
  return {current,longest};
}
export function activitySummary(days,today){
  const sum=dates=>dates.reduce((total,d)=>total+countOn(days,d),0);
  let best=null;for(const [date,list] of days)if(!best||list.length>best.count||(list.length===best.count&&date>best.date))best={date,count:list.length};
  return {today:countOn(days,today),week:sum(dateRange(today,7)),lastWeek:sum(dateRange(addDays(today,-7),7)),average30:sum(dateRange(today,30))/30,best,...streaks(days,today)};
}
export function weekdayTotals(days){
  const totals=Array(7).fill(0);for(const [date,list] of days)totals[weekday(date)]+=list.length;return totals;
}
export function stageSummary(records){
  const counts=Object.fromEntries(STAGES.map(stage=>[stage,0]));
  for(const record of records)if(Object.hasOwn(counts,record.stage))counts[record.stage]++;
  const submitted=records.length-counts['To apply'];
  const responded=records.filter(r=>RESPONDED.includes(r.stage)||(r.stage!=='To apply'&&r.responseDate)).length;
  return {counts,total:records.length,submitted,inProcess:counts.Assessment+counts.Interview,responded,responseRate:submitted?responded/submitted:0};
}
// Stages record only where each application is now, so "reached" counts current position or later.
export function funnel(records){
  const {submitted,responded,counts}=stageSummary(records);
  return [
    {label:'Submitted',count:submitted},
    {label:'Heard back',count:responded},
    {label:'Assessment or further',count:counts.Assessment+counts.Interview+counts.Offer},
    {label:'Interviewing or further',count:counts.Interview+counts.Offer},
    {label:'Offer',count:counts.Offer},
  ];
}
export function weeklyCohorts(days,today,weeks){
  const first=addDays(weekStart(today),-7*(weeks-1));
  return Array.from({length:weeks},(_,i)=>{
    const start=addDays(first,7*i),list=dateRange(addDays(start,6),7).flatMap(d=>days.get(d)||[]);
    return {start,count:list.length,stages:byStage(list)};
  });
}
export const RESPONSE_BUCKETS=[['Same week',0,7],['1–2 weeks',8,14],['2–4 weeks',15,28],['1–2 months',29,60],['2+ months',61,Infinity]];
export function responseTimes(records){
  const waits=records.filter(r=>r.stage!=='To apply'&&r.appliedDate&&r.responseDate&&validDate(r.appliedDate)&&validDate(r.responseDate)).map(r=>daysBetween(r.appliedDate,r.responseDate)).filter(n=>n>=0).sort((a,b)=>a-b);
  const median=waits.length?(waits.length%2?waits[(waits.length-1)/2]:(waits[waits.length/2-1]+waits[waits.length/2])/2):null;
  return {median,count:waits.length,buckets:RESPONSE_BUCKETS.map(([label,min,max])=>({label,count:waits.filter(n=>n>=min&&n<=max).length}))};
}
export function topValues(records,field,limit){
  const counts=new Map();
  for(const record of records){const value=record[field]?.trim();if(!value||record.stage==='To apply')continue;const key=value.toLocaleLowerCase();const entry=counts.get(key)||{label:value,count:0};entry.count++;counts.set(key,entry);}
  const sorted=[...counts.values()].sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label));
  return {items:sorted.slice(0,limit),others:sorted.slice(limit).reduce((sum,item)=>sum+item.count,0)};
}
export function niceMax(value){
  // Even maxima keep the midpoint gridline on a whole number.
  if(value<=10)return Math.max(2,Math.ceil(value/2)*2);
  const step=10**Math.floor(Math.log10(value)),scaled=value/step;
  return [1,2,4,5,10].find(n=>n>=scaled)*step;
}
