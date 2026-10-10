import{strToU8 as e,zipSync as t}from"./browser-BXlMmLo7.js";import{Ut as n,tt as r}from"./share-iPhxv2DY.js";var i=`
CREATE TABLE col (id integer primary key, crt integer not null, mod integer not null, scm integer not null, ver integer not null, dty integer not null, usn integer not null, ls integer not null, conf text not null, models text not null, decks text not null, dconf text not null, tags text not null);
CREATE TABLE notes (id integer primary key, guid text not null, mid integer not null, mod integer not null, usn integer not null, tags text not null, flds text not null, sfld integer not null, csum integer not null, flags integer not null, data text not null);
CREATE TABLE cards (id integer primary key, nid integer not null, did integer not null, ord integer not null, mod integer not null, usn integer not null, type integer not null, queue integer not null, due integer not null, ivl integer not null, factor integer not null, reps integer not null, lapses integer not null, left integer not null, odue integer not null, odid integer not null, flags integer not null, data text not null);
CREATE TABLE revlog (id integer primary key, cid integer not null, usn integer not null, ease integer not null, ivl integer not null, lastIvl integer not null, factor integer not null, time integer not null, type integer not null);
CREATE TABLE graves (usn integer not null, oid integer not null, type integer not null);
CREATE INDEX ix_notes_usn on notes (usn);
CREATE INDEX ix_cards_usn on cards (usn);
CREATE INDEX ix_revlog_usn on revlog (usn);
CREATE INDEX ix_cards_nid on cards (nid);
CREATE INDEX ix_cards_sched on cards (did, queue, due);
CREATE INDEX ix_revlog_cid on revlog (cid);
CREATE INDEX ix_notes_csum on notes (csum);
`,a=`.card { font-family: arial; font-size: 20px; text-align: center; color: black; background-color: white; }
.cloze { font-weight: bold; color: blue; }
.nightMode .cloze { color: lightblue; }`,o=(e,t)=>({name:e,ord:t,sticky:!1,rtl:!1,font:`Arial`,size:20,media:[]}),s=(e,t,n,r)=>({name:e,ord:t,qfmt:n,afmt:r,did:null,bqfmt:``,bafmt:``});function c(e){let t={mod:e,usn:-1,sortf:0,did:1,css:a,latexPre:`\\documentclass[12pt]{article}
\\special{papersize=3in,5in}
\\usepackage[utf8]{inputenc}
\\usepackage{amssymb,amsmath}
\\pagestyle{empty}
\\setlength{\\parindent}{0in}
\\begin{document}
`,latexPost:`\\end{document}`,tags:[],vers:[]};return{basic:{...t,id:1700000000001,name:`Мнема: вопрос — ответ`,type:0,flds:[o(`Front`,0),o(`Back`,1)],tmpls:[s(`Card 1`,0,`{{Front}}`,`{{FrontSide}}

<hr id=answer>

{{Back}}`)],req:[[0,`any`,[0]]]},reverse:{...t,id:1700000000002,name:`Мнема: в обе стороны`,type:0,flds:[o(`Front`,0),o(`Back`,1)],tmpls:[s(`Card 1`,0,`{{Front}}`,`{{FrontSide}}

<hr id=answer>

{{Back}}`),s(`Card 2`,1,`{{Back}}`,`{{FrontSide}}

<hr id=answer>

{{Front}}`)],req:[[0,`any`,[0]],[1,`any`,[1]]]},typing:{...t,id:1700000000003,name:`Мнема: ввести ответ`,type:0,flds:[o(`Front`,0),o(`Back`,1)],tmpls:[s(`Card 1`,0,`{{Front}}

{{type:Back}}`,`{{Front}}

<hr id=answer>

{{type:Back}}`)],req:[[0,`any`,[0]]]},cloze:{...t,id:1700000000004,name:`Мнема: с пропуском`,type:1,flds:[o(`Text`,0),o(`Back Extra`,1)],tmpls:[s(`Cloze`,0,`{{cloze:Text}}`,`{{cloze:Text}}<br>
{{Back Extra}}`)],req:[[0,`any`,[0]]]}}}var l={1:{id:1,name:`Default`,mod:0,usn:0,maxTaken:60,autoplay:!0,timer:0,replayq:!0,dyn:!1,new:{bury:!1,delays:[1,10],initialFactor:2500,ints:[1,4,0],order:1,perDay:20},rev:{bury:!1,ease4:1.3,ivlFct:1,maxIvl:36500,perDay:200,hardFactor:1.2},lapse:{delays:[10],leechAction:1,leechFails:8,minInt:1,mult:0}}};function u(e){return e.replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`)}function d(e){let t=[],n=e.replace(/\$\$([\s\S]+?)\$\$/g,(e,n)=>(t.push(`\\[${n.trim()}\\]`),`\u0000${t.length-1}\u0000`));n=n.replace(/\$([^$\n]+?)\$/g,(e,n)=>(t.push(`\\(${n.trim()}\\)`),`\u0000${t.length-1}\u0000`));let r=[];return n=n.replace(/!\[[^\]]*\]\((data:image\/[^)]+)\)/g,(e,t)=>(r.push(`<img src="${t}">`),`\u0001${r.length-1}\u0001`)),n=u(n),n=n.replace(/\*\*(.+?)\*\*/g,`<b>$1</b>`).replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g,`$1<i>$2</i>`).replace(/==(.+?)==/g,`<u>$1</u>`),n=n.replace(/\n/g,`<br>`),n=n.replace(/\u0000(\d+)\u0000/g,(e,n)=>u(t[Number(n)])),n=n.replace(/\u0001(\d+)\u0001/g,(e,t)=>r[Number(t)]),n}function f(e){let t=0,n=new Set;for(let t of e.matchAll(/\{\{c(\d+)::/g))n.add(Number(t[1]));return e.replace(/\{\{(?!c\d+::)([\s\S]+?)\}\}/g,(e,r)=>{do t++;while(n.has(t));return`{{c${t}::${r}}}`})}function p(e){return[...new Set([...f(e.front).matchAll(/\{\{c(\d+)::/g)].map(e=>Number(e[1])-1))].sort((e,t)=>e-t)}function m(e){return e.replace(/<[^>]+>/g,``).replace(/&nbsp;/g,` `).trim()}async function h(e){let t=new Uint8Array(await crypto.subtle.digest(`SHA-1`,new TextEncoder().encode(m(e))));return(t[0]<<24>>>0)+(t[1]<<16)+(t[2]<<8)+t[3]}function g(){let e=``,t=crypto.getRandomValues(new Uint8Array(10));for(let n of t)e+="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%&()*+,-./:;<=>?@[]^_`{|}~"[n%91];return e}async function _(a,o,s){let u=new o.Database;u.run(i);let _=Date.now(),v=Math.floor(_/1e3),y=new Date;y.setHours(4,0,0,0);let b=Math.floor(y.getTime()/1e3)-31536e4,x=c(v),S={},C={mod:v,usn:-1,desc:``,dyn:0,conf:1,collapsed:!1,browserCollapsed:!1,newToday:[0,0],revToday:[0,0],lrnToday:[0,0],timeToday:[0,0],extendNew:10,extendRev:50};S[1]={...C,id:1,name:`Default`};let w=1700000000100,T=new Map,E=e=>{if(T.has(e))return T.get(e);let t=++w;return S[String(t)]={...C,id:t,name:e},T.set(e,t),t};E(`Мнема`);let D=r(a).filter(e=>!s.subjectIds||s.subjectIds.includes(e.id)),O=e=>{let t=[];for(let n=a.topics.find(t=>t.id===e);n;n=a.topics.find(e=>e.id===n.parentId))t.unshift(n.name.replace(/::/g,`:`));return t},k=u.prepare(`INSERT INTO notes VALUES (?,?,?,?,?,?,?,?,?,?,?)`),A=u.prepare(`INSERT INTO cards VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`),j=u.prepare(`INSERT INTO revlog VALUES (?,?,?,?,?,?,?,?,?)`),M=_*1e3,N=_*1e3,P=0,F=0,I=0,L=e=>Math.max(0,Math.round((new Date(e).getTime()/1e3-b)/86400)),R=(e,t,r,i)=>{let o=s.progress?a.states[n(e.id,e.type===`cloze`?p(e).indexOf(t):t)]:void 0,c=0,l=0,u=P,d=0,f=0;if(o&&o.state===2&&(c=2,l=2,u=L(o.due),d=Math.max(1,o.scheduled_days||Math.round(o.stability)),f=Math.round(Math.min(3500,Math.max(1300,2500+(5-o.difficulty)*150)))),A.run([++N,i,r,t,v,-1,c,l,u,d,f,o?.reps??0,o?.lapses??0,0,0,0,0,``]),I++,o&&o.state===2){let e=new Date(o.last_review??Date.now()).getTime();j.run([e+I%997,N,-1,3,d,Math.max(1,Math.round(d/2.5)),f,8e3,1])}};for(let e of D){let t=a.topics.filter(t=>t.subjectId===e.id);for(let n of t){let t=a.cards.filter(e=>e.topicId===n.id);if(!t.length)continue;let r=E([`Мнема`,e.name.replace(/::/g,`:`),...n.kind===`rule`?[`Правила`]:[],...O(n.id)].join(`::`));for(let i of t){P++;let t=i.why?`<br><br><i>${d(i.why)}</i>`:``,a,o,s;if(i.type===`cloze`){a=x.cloze.id;let e=d(f(i.front));o=[e,d(i.back||``)+t],s=[...new Set([...e.matchAll(/\{\{c(\d+)::/g)].map(e=>Number(e[1])-1))].sort((e,t)=>e-t)}else i.type===`reverse`?(a=x.reverse.id,o=[d(i.front),d(i.back)+t],s=[0,1]):i.type===`typing`?(a=x.typing.id,o=[d(i.front)+t,i.back.split(`|`)[0].trim()],s=[0]):(a=x.basic.id,o=[d(i.front),d(i.back)+t],s=[0]);let c=++M,l=` Мнема ${e.name.replace(/\s+/g,`_`)} ${n.important?`важное `:``}`;k.run([c,g(),a,v,-1,l,o.join(``),m(o[0]),await h(o[0]),0,``]),F++;for(let e of s)R(i,e,r,c)}}}k.free(),A.free(),j.free();let z={nextPos:P+1,estTimes:!0,activeDecks:[1],sortType:`noteFld`,timeLim:0,sortBackwards:!1,addToCur:!0,curDeck:1,newBury:!0,newSpread:0,dueCounts:!0,curModel:String(x.basic.id),collapseTime:1200},B=Object.fromEntries(Object.values(x).map(e=>[String(e.id),e]));u.run(`INSERT INTO col VALUES (1,?,?,?,11,0,0,0,?,?,?,?,?)`,[b,_,_,JSON.stringify(z),JSON.stringify(B),JSON.stringify(S),JSON.stringify(l),`{}`]);let V=u.export();return u.close(),{bytes:t({"collection.anki2":V,media:e(`{}`)},{level:6}),notes:F,cards:I}}export{_ as buildApkg,f as toAnkiCloze,d as toAnkiHtml};