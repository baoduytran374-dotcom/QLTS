// Logic dashboard gốc (giữ nguyên công thức KPI/biểu đồ/bảng). Được bọc thành hàm để có thể dựng lại
// toàn bộ dashboard từ bộ dữ liệu mới mà không giữ lại bất kỳ số liệu cũ nào.
import Chart from 'chart.js/auto';
import * as XLSX from 'xlsx';

export function createDashboard(data,O={}){
const D=JSON.parse(JSON.stringify(data));
const S=D.students,CL=D.classes;
const $=id=>document.getElementById(id);
const fm=n=>n==null?'—':Math.round(n).toLocaleString('vi-VN')+' ₫';
const fn=n=>Math.round(n).toLocaleString('vi-VN');
const fd=s=>s?s.split('-').reverse().join('/'):'—';
const pc=(a,b)=>b>0?(100*a/b).toFixed(1)+'%':'—';
const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const P=s=>{const[y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)};
const addD=(s,n)=>{const d=P(s);d.setDate(d.getDate()+n);return iso(d)};
const mon=s=>{const d=P(s);d.setDate(d.getDate()-((d.getDay()+6)%7));return iso(d)};
const sum=(a,f)=>a.reduce((x,y)=>x+(f(y)||0),0);
const esc=s=>String(s??'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
S.forEach(s=>{s.paid=sum(s.pays,p=>p[1]);s.owe=s.fee==null?null:s.fee-s.paid;s.cl=s.cls||'(Chưa xếp lớp)';s.sr=s.src||'(Chưa có nguồn)';s.tv=s.tvv||'(Chưa có TVV)';s.co=s.course||'(Chưa rõ)';s.lastPay=s.pays.map(p=>p[0]).filter(Boolean).sort().pop()||null});
const hasSrc=S.some(s=>s.src);
const regs=S.map(s=>s.reg).filter(Boolean).sort(),RMIN=regs[0],RMAX=regs[regs.length-1];
const pdts=S.flatMap(s=>s.pays.map(p=>p[0])).filter(Boolean).sort();
const months=[...new Set([...regs,...pdts].map(x=>x.slice(0,7)))].sort();
const mLabel=m=>m.slice(5)+'/'+m.slice(0,4);
const mEnd=m=>{const[y,mm]=m.split('-').map(Number);return iso(new Date(y,mm,0))};
const mPrev=m=>{const[y,mm]=m.split('-').map(Number);return iso(new Date(y,mm-2,1)).slice(0,7)};
const opts=(a,sel,lab=x=>x)=>a.map(x=>`<option value="${esc(x)}"${x===sel?' selected':''}>${esc(lab(x))}</option>`).join('');
const uniq=f=>[...new Set(S.map(f))].sort((a,b)=>String(a).localeCompare(String(b),'vi'));
// ---- global filters
const G={co:'',cl:'',tv:'',sr:'',kg:''};
$('gf').innerHTML=[['co','Khóa học',uniq(s=>s.co),x=>x],['cl','Lớp học',uniq(s=>s.cl),x=>x],['tv','Tư vấn viên',uniq(s=>s.tv),x=>x],['sr','Nguồn tuyển sinh',uniq(s=>s.sr),x=>x],['kg','Tháng khai giảng',uniq(s=>s.kg).filter(x=>x),x=>'Tháng '+x]]
 .map(([k,l,a,lb])=>`<label>${l}<select data-g="${k}"><option value="">Tất cả</option>${opts(a,'',lb)}</select></label>`).join('')+'<button class="btn" id="rst">Đặt lại bộ lọc</button>';
$('gf').onchange=e=>{if(e.target.dataset.g){G[e.target.dataset.g]=e.target.value;render()}};
$('rst').onclick=()=>{Object.keys(G).forEach(k=>G[k]='');$('gf').querySelectorAll('select').forEach(s=>s.value='');ST.from=ST.to='';ST.pm=PM0;ST.wk=WK0;ST.mode='reg';ST.stat='';ST.cf='';ST.ct='';ST.mm=MM0;buildCtl();render()};
const base=()=>S.filter(s=>(!G.co||s.co===G.co)&&(!G.cl||s.cl===G.cl)&&(!G.tv||s.tv===G.tv)&&(!G.sr||s.sr===G.sr)&&(!G.kg||s.kg==G.kg));
const inR=(d,a,b)=>d&&(!a||d>=a)&&(!b||d<=b);
const regIn=(L,a,b)=>L.filter(s=>s.reg&&inR(s.reg,a,b));
const cashIn=(L,a,b)=>sum(L,s=>sum(s.pays.filter(p=>inR(p[0],a,b)),p=>p[1]));
const cohort=L=>({n:L.length,rev:sum(L,s=>s.fee),paid:sum(L,s=>s.paid),
 owe:sum(L.filter(s=>s.st==='Chưa hoàn tất'),s=>s.owe),nOwe:L.filter(s=>s.st==='Chưa hoàn tất').length,nDone:L.filter(s=>s.st==='Đã hoàn tất').length,nRec:L.filter(s=>s.st==='Cần đối soát').length})
const grp=(L,f)=>{const m=new Map();L.forEach(s=>{const k=f(s);if(!m.has(k))m.set(k,[]);m.get(k).push(s)});return m};
const delta=(a,b)=>b>0?((a-b)/b*100):null;
const dtxt=(a,b,lab)=>{const d=delta(a,b);return d==null?`${lab}: chưa đủ dữ liệu so sánh`:`<span class="${d>=0?'up':'dn'}">${d>=0?'▲':'▼'} ${Math.abs(d).toFixed(1)}%</span> so với ${lab}`};
const kpi=(l,v,u,d,c='')=>`<div class="k ${c}"><div class="l">${l}</div><div class="v">${v}${u?` <small>${u}</small>`:''}</div><div class="d">${d}</div></div>`;
// ---- state
const lastM=regs.length?RMAX.slice(0,7):months[months.length-1];
const PM0=lastM,MM0=lastM;
const weeks=[];for(let w=mon(RMIN);w<=RMAX;w=addD(w,7))weeks.push(w);
const WK0=weeks[weeks.length-1];
const ST={from:'',to:'',pm:PM0,wk:WK0,wf:'',wt:'',mode:'reg',mm:MM0,stat:'',cf:'',ct:'',tab:(O.tab||'t1'),cm:'d',cmet:'n',c2:'a',c5:'n',c9:'n'};
const wkLabel=w=>fd(w)+' – '+fd(addD(w,6));
// ---- tables
const TB={};
function table(id,cols,rows,o={}){const T=TB[id]=TB[id]||{q:'',sk:null,sd:1,pg:0};T.cols=cols;T.rows=rows;T.o=o;if(o.sort&&T.sk==null){T.sk=o.sort;T.sd=o.dir||-1}drawT(id)}
function drawT(id){const T=TB[id],el=$(id),ps=T.o.ps||10;let r=T.rows;
 if(T.q){const q=T.q.toLowerCase();r=r.filter(x=>T.cols.some(c=>String(c.v?c.v(x):c.f(x)).toLowerCase().includes(q)))}
 if(T.sk!=null){const c=T.cols[T.sk];r=[...r].sort((a,b)=>{const x=c.v?c.v(a):c.f(a),y=c.v?c.v(b):c.f(b);return(typeof x==='number'&&typeof y==='number'?x-y:String(x??'').localeCompare(String(y??''),'vi'))*T.sd})}
 const np=Math.max(1,Math.ceil(r.length/ps));T.pg=Math.min(T.pg,np-1);const pg=r.slice(T.pg*ps,T.pg*ps+ps);
 T.view=r;
 el.innerHTML=`<div class="tools"><input placeholder="Tìm kiếm…" value="${esc(T.q)}" data-q><span class="sp"></span><span style="color:var(--mut);font-size:12.5px">${r.length} dòng</span><button class="btn" data-x>Xuất Excel</button></div>
 <div class="tw"><table><thead><tr>${T.cols.map((c,i)=>`<th class="${c.n?'n':''}" data-s="${i}">${c.t}${T.sk===i?(T.sd>0?' ▲':' ▼'):''}</th>`).join('')}</tr></thead>
 <tbody>${pg.map((x,i)=>`<tr class="${T.o.click?'c':''}" data-r="${T.pg*ps+i}">${T.cols.map(c=>`<td class="${c.n?'n':''}">${c.h?c.f(x):esc(c.f(x))}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="${T.cols.length}" class="na">Không có dữ liệu cho bộ lọc hiện tại.</td></tr>`}</tbody></table></div>
 <div class="pg"><button class="btn" data-p="-1">‹</button>Trang ${T.pg+1}/${np}<button class="btn" data-p="1">›</button></div>`;
 const qi=el.querySelector('[data-q]');qi.oninput=()=>{T.q=qi.value;T.pg=0;drawT(id);const n=el.querySelector('[data-q]');n.focus();n.setSelectionRange(n.value.length,n.value.length)};
 el.querySelectorAll('th').forEach(h=>h.onclick=()=>{const i=+h.dataset.s;if(T.sk===i)T.sd*=-1;else{T.sk=i;T.sd=1}drawT(id)});
 el.querySelectorAll('[data-p]').forEach(b=>b.onclick=()=>{T.pg=Math.max(0,Math.min(np-1,T.pg+ +b.dataset.p));drawT(id)});
 el.querySelector('[data-x]').onclick=()=>xlsx(T.o.name||id,T.cols,T.view);
 if(T.o.click)el.querySelectorAll('tbody tr.c').forEach(tr=>tr.onclick=()=>T.o.click(T.view[+tr.dataset.r]))}
async function xlsx(name,cols,rows){const data=rows.map(r=>Object.fromEntries(cols.map(c=>[c.t.replace(/<[^>]+>/g,''),c.v?c.v(r):c.f(r)])));
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(data),'Dữ liệu');
 const buf=XLSX.write(wb,{type:'array',bookType:'xlsx'});
 try{XLSX.writeFile(wb,name+'.xlsx')}catch(_){alert('Không thể tải tệp Excel.')}}
const stTag=s=>({'Đã hoàn tất':'t-ok','Chưa hoàn tất':'t-bad','Cần đối soát':'t-w','Chưa đủ dữ liệu':'t-g'}[s]||'t-g');
const stCol={t:'Tình trạng',f:s=>`<span class="tag ${stTag(s.st)}">${s.st}</span>`,h:1,v:s=>s.st};
function showStu(s){$('mt').textContent=s.name+' · '+s.id;
 $('mb').innerHTML=`<div class="kv"><div>Lớp</div><div>${esc(s.cl)}</div><div>Khóa học</div><div>${esc(s.co)}</div><div>Tháng khai giảng</div><div>${s.kg?'Tháng '+s.kg:'—'}</div><div>Ngày đăng ký</div><div>${fd(s.reg)}</div><div>Tư vấn viên</div><div>${esc(s.tv)}</div><div>Nguồn</div><div>${esc(s.sr)}</div><div>Ưu đãi</div><div>${esc(s.promo)||'—'}</div><div>Học phí áp dụng</div><div>${fm(s.fee)}</div><div>Đã thanh toán</div><div>${fm(s.paid)}</div><div>Còn phải thanh toán</div><div>${s.st==='Đã hoàn tất'?fm(0):fm(s.owe)}</div><div>Tình trạng</div><div><span class="tag ${stTag(s.st)}">${s.st}</span></div><div>Nguồn dữ liệu thanh toán</div><div>${esc(s.basis)}</div><div>Ghi chú</div><div>${esc(s.note)||'—'}</div></div>
 <div class="tw"><table><thead><tr><th>Lần</th><th>Ngày thanh toán</th><th class="n">Số tiền</th></tr></thead><tbody>${s.pays.map((p,i)=>`<tr><td>${i+1}</td><td>${fd(p[0])}</td><td class="n">${fn(p[1])}</td></tr>`).join('')||'<tr><td colspan="3" class="na">Chưa có khoản thanh toán</td></tr>'}</tbody></table></div><div class="na">Thông tin liên hệ/CCCD không được đưa vào dashboard.</div>`;md.classList.add('on')}
const md=$('md');md.onclick=e=>{if(e.target===md)md.classList.remove('on')};
function listModal(t,L){$('mt').textContent=t;$('mb').innerHTML='<div id="tbm"></div>';md.classList.add('on');table('tbm',stuCols(),L,{name:'danh_sach',click:showStu,ps:8})}
const stuCols=()=>[{t:'Mã HV',f:s=>s.id},{t:'Họ và tên',f:s=>s.name},{t:'Ngày ĐK',f:s=>fd(s.reg),v:s=>s.reg||''},{t:'Khóa học',f:s=>s.co},{t:'Mã lớp',f:s=>s.cl},{t:'Tư vấn viên',f:s=>s.tv},{t:'Học phí áp dụng',f:s=>fm(s.fee),v:s=>s.fee||0,n:1},{t:'Thực thu',f:s=>fm(s.paid),v:s=>s.paid,n:1},{t:'Công nợ',f:s=>s.st==='Chưa hoàn tất'?fm(s.owe):fm(0),v:s=>s.st==='Chưa hoàn tất'?s.owe:0,n:1},stCol];
// ---- charts
const CH={};const PAL=['#D3222B','#7A1217','#E5757B','#8A8F98','#3C4043','#F1B1B4','#B8BCC3'];
function chart(id,cfg){if(CH[id])CH[id].destroy();const cs=getComputedStyle(document.documentElement),ink=cs.getPropertyValue('--mut').trim(),ln=cs.getPropertyValue('--line').trim();
 Chart.defaults.color=ink;Chart.defaults.font.family='"Be Vietnam Pro",system-ui,sans-serif';cfg.options=Object.assign({responsive:true,maintainAspectRatio:false},cfg.options);
 if(cfg.options.scales)Object.values(cfg.options.scales).forEach(s=>{s.grid=Object.assign({color:ln},s.grid)});
 CH[id]=new Chart($(id),cfg);return CH[id]}
const ax=(f)=>({y:{beginAtZero:true,ticks:{callback:f||(v=>v)}},x:{}});
const tipM={callbacks:{label:c=>c.dataset.label+': '+(c.dataset.pct?c.parsed.y.toFixed(1)+'%':fn(c.parsed.y))}};
function empty(id,msg){if(CH[id]){CH[id].destroy();delete CH[id]}const c=$(id).getContext('2d');c.clearRect(0,0,9999,9999);c.fillStyle='#888';c.font='13px sans-serif';c.fillText(msg,10,24)}
// ---- controls
const seg=(id,key)=>{$(id).onclick=e=>{if(!e.target.dataset.v)return;ST[key]=e.target.dataset.v;render()}};
seg('s1a','cm');seg('s1b','cmet');seg('s2','c2');seg('s5','c5');seg('s3','c9');
function segSync(id,key){$(id).querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.v===ST[key]))}
const dIn=(k,l)=>`<label>${l}<input type="date" data-st="${k}" value="${ST[k]}"></label>`;
const sel=(k,l,a,lab)=>`<label>${l}<select data-st="${k}">${opts(a,ST[k],lab)}</select></label>`;
function buildCtl(){
 $('t1f').innerHTML=dIn('from','Từ ngày')+dIn('to','Đến ngày')+`<label>Năm<select data-yr><option value="">Tất cả</option><option>2026</option></select></label>`+`<label>Tháng<select data-mo><option value="">Tất cả</option>${months.map(m=>`<option value="${m}">${mLabel(m)}</option>`).join('')}</select></label>`+`<label>Tuần<select data-wk><option value="">Tất cả</option>${weeks.map(w=>`<option value="${w}">${wkLabel(w)}</option>`).join('')}</select></label>`;
 $('t2f').innerHTML=sel('pm','Tháng',[...months].reverse(),mLabel)+`<span class="na">Mặc định: tháng gần nhất có dữ liệu. Tuyển sinh tính theo ngày đăng ký.</span>`;
 $('t3f').innerHTML=sel('wk','Tuần (Thứ Hai–Chủ nhật)',[...weeks].reverse(),wkLabel)+dIn('wf','Hoặc từ ngày')+dIn('wt','đến ngày');
 $('t4f').innerHTML=`<label>Chế độ xem<select data-st="mode"><option value="reg"${ST.mode==='reg'?' selected':''}>Theo tháng đăng ký</option><option value="pay"${ST.mode==='pay'?' selected':''}>Theo tháng thu tiền</option></select></label>`+sel('mm','Tháng',['',...[...months].reverse()],m=>m?mLabel(m):'Tất cả')+dIn('cf','Từ ngày')+dIn('ct','Đến ngày')+sel('stat','Trạng thái học phí',['','Chưa hoàn tất','Đã hoàn tất','Cần đối soát','Chưa đủ dữ liệu'],x=>x||'Tất cả')}
const onChange=e=>{const t=e.target;if(t.dataset.st){ST[t.dataset.st]=t.value;if(t.dataset.st==='wk'){ST.wf=ST.wt='';}render();return}
 if(t.dataset.mo!==undefined){if(t.value){ST.from=t.value+'-01';ST.to=mEnd(t.value)}else ST.from=ST.to='';render()}
 if(t.dataset.wk!==undefined){if(t.value){ST.from=t.value;ST.to=addD(t.value,6)}else ST.from=ST.to='';render()}
 if(t.dataset.yr!==undefined){if(t.value){ST.from=t.value+'-01-01';ST.to=t.value+'-12-31'}else ST.from=ST.to='';render()}};document.addEventListener('change',onChange);
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{ST.tab=b.dataset.t;render();window.scrollTo(0,0)});
// ---- sources
const srcRows=(L,a,b,pa,pb)=>[...grp(L.filter(s=>s.reg&&inR(s.reg,a,b)),s=>s.sr)].map(([k,v])=>({k,v,n:v.length,rev:sum(v,s=>s.fee),cash:cashIn(v,a,b),pn:pa?regIn(L.filter(s=>s.sr===k),pa,pb).length:null}));
// ================= TAB 1
function r1(){const B=base(),a=ST.from,b=ST.to;
 const tot=B.filter(s=>!b||(s.reg&&s.reg<=b)),nw=(a||b)?regIn(B,a,b):B,c=cohort(nw);
 let prev='';if(a&&b){const len=Math.round((P(b)-P(a))/864e5)+1,pb=addD(a,-1),pa=addD(a,-len);prev=dtxt(nw.length,regIn(B,pa,pb).length,'kỳ trước ('+len+' ngày)')}else prev='Chọn khoảng ngày để so sánh kỳ trước';
 $('t1k').innerHTML=kpi('Tổng học viên tuyển sinh',fn(tot.length),'HV','Đếm theo mã học viên duy nhất, đến hết kỳ chọn')+kpi('Đăng ký mới trong kỳ',fn(nw.length),'HV',prev)+kpi('Tổng doanh thu đăng ký',fn(c.rev/1e6),'triệu ₫','Tổng học phí áp dụng của HV đăng ký trong kỳ')+kpi('Tổng thực thu',fn(((a||b)?cashIn(B,a,b):sum(B,s=>s.paid))/1e6),'triệu ₫','Các khoản thanh toán có ngày thu trong kỳ')+kpi('Tổng công nợ học phí',fn(c.owe/1e6),'triệu ₫','Còn lại của HV "Chưa hoàn tất" (lũy kế)','red')+kpi('Tỷ lệ hoàn tất học phí',pc(c.paid,c.rev),'','Thanh toán lũy kế ÷ học phí áp dụng của nhóm')+kpi('Số lớp có học viên',fn(new Set(nw.map(s=>s.cls).filter(x=>x)).size),'lớp','Không tính HV chưa xếp lớp ('+nw.filter(s=>!s.cls).length+' HV)')+kpi('HV còn công nợ',fn(c.nOwe),'HV',c.nRec+' HV cần đối soát','red');
 segSync('s1a','cm');segSync('s1b','cmet');segSync('s2','c2');segSync('s5','c5');
 // trend
 const key=d=>ST.cm==='d'?d:ST.cm==='w'?mon(d):d.slice(0,7);const gm=grp(nw.filter(s=>s.reg),s=>key(s.reg));const ks=[...gm.keys()].sort();
 chart('c1',{type:ST.cm==='m'?'bar':'line',data:{labels:ks.map(k=>ST.cm==='m'?mLabel(k):fd(k).slice(0,5)),datasets:[{label:ST.cmet==='n'?'Học viên đăng ký':'Doanh thu đăng ký',data:ks.map(k=>ST.cmet==='n'?gm.get(k).length:sum(gm.get(k),s=>s.fee)),borderColor:'#D3222B',backgroundColor:'#D3222B',tension:.25,pointRadius:2}]},options:{plugins:{legend:{display:false},tooltip:tipM},scales:ax(ST.cmet==='r'?v=>v/1e6+'tr':null)}});
 // rev vs cash by month
 const ms=months.filter(m=>m>=(a||'').slice(0,7)&&(!b||m<=b.slice(0,7)));const rv=ms.map(m=>sum(regIn(B,m+'-01',mEnd(m)),s=>s.fee)),cs=ms.map(m=>cashIn(B,m+'-01',mEnd(m)));
 const pct=ST.c2==='p';
 chart('c2',{type:pct?'line':'bar',data:{labels:ms.map(mLabel),datasets:pct?[{label:'Thực thu / Doanh thu đăng ký',pct:1,data:ms.map((m,i)=>rv[i]?cs[i]/rv[i]*100:null),borderColor:'#D3222B',backgroundColor:'#D3222B'}]:[{label:'Doanh thu đăng ký',data:rv,backgroundColor:'#8A8F98'},{label:'Thực thu',data:cs,backgroundColor:'#D3222B'}]},options:{plugins:{tooltip:tipM},scales:ax(pct?v=>v+'%':v=>v/1e6+'tr')}});
 // course
 const gc=[...grp(nw,s=>s.co)].sort((x,y)=>y[1].length-x[1].length);
 chart('c3',{type:'doughnut',data:{labels:gc.map(x=>x[0]),datasets:[{data:gc.map(x=>x[1].length),backgroundColor:PAL}]},options:{plugins:{legend:{position:'right'},tooltip:{callbacks:{label:c=>`${c.label}: ${c.parsed} HV (${pc(c.parsed,nw.length)})`}}}}});
 // class
 const gk=[...grp(nw,s=>s.cl)].sort((x,y)=>y[1].length-x[1].length).slice(0,15);
 chart('c4',{type:'bar',data:{labels:gk.map(x=>x[0]),datasets:[{label:'Học viên',data:gk.map(x=>x[1].length),backgroundColor:'#D3222B'}]},options:{indexAxis:'y',plugins:{legend:{display:false}},onClick:(e,el)=>{if(el.length)listModal('Lớp '+gk[el[0].index][0],gk[el[0].index][1])},scales:{x:{beginAtZero:true,ticks:{precision:0}},y:{ticks:{autoSkip:false}}}}});
 // tvv
 const gt=[...grp(nw,s=>s.tv)].map(([k,v])=>({k,n:v.length,r:sum(v,s=>s.fee),c:cashIn(v,a,b)||sum(v,s=>s.paid)*((a||b)?0:1)})).sort((x,y)=>y[ST.c5]-x[ST.c5]).slice(0,12);
 chart('c5',{type:'bar',data:{labels:gt.map(x=>x.k),datasets:[{label:ST.c5==='n'?'Học viên':ST.c5==='r'?'Doanh thu đăng ký':'Thực thu',data:gt.map(x=>x[ST.c5]),backgroundColor:'#D3222B'}]},options:{plugins:{legend:{display:false},tooltip:tipM},scales:ax(ST.c5==='n'?null:v=>v/1e6+'tr')}});
 // source
 const ss=srcRows(B,a,b).filter(x=>x.k!=='(Chưa có nguồn)').sort((x,y)=>y.n-x.n),miss=nw.filter(s=>!s.src).length;
 if(ss.length)chart('c6',{type:'doughnut',data:{labels:ss.map(x=>x.k),datasets:[{data:ss.map(x=>x.n),backgroundColor:PAL}]},options:{plugins:{legend:{position:'right'},tooltip:{callbacks:{label:c=>`${c.label}: ${c.parsed} HV (${pc(c.parsed,nw.length)})`}}}}});else empty('c6','Chưa có dữ liệu nguồn tuyển sinh');
 $('c6n').innerHTML=miss?`<div class="na">${miss} HV chưa có nguồn — không phân bổ giả định.</div>`:'';
 table('tb1',stuCols(),nw,{name:'hoc_vien',click:showStu,sort:2,dir:-1})}
// ================= TAB 2
function perf(L,a,b){return [...grp(L.filter(s=>s.reg&&inR(s.reg,a,b)),s=>s.tv)].map(([k,v])=>({k,n:v.length,rev:sum(v,s=>s.fee),cash:cashIn(v,a,b),paid:sum(v,s=>s.paid)}))}
function r2(){const B=base(),m=ST.pm,a=m+'-01',b=mEnd(m),pm=mPrev(m),nw=regIn(B,a,b),pn=regIn(B,pm+'-01',mEnd(pm));
 const cm=[...grp(nw,s=>s.co)].map(([k,v])=>`<span class="tag t-g">${esc(k)}: ${v.length}</span>`).join(' ');
 const cashM=cashIn(B,a,b),cashPrior=sum(B.filter(s=>s.reg&&s.reg<a),s=>sum(s.pays.filter(p=>inR(p[0],a,b)),p=>p[1]));
 $('t2k').innerHTML=kpi('Học viên đăng ký mới',fn(nw.length),'HV',dtxt(nw.length,pn.length,'tháng '+mLabel(pm)))+kpi('Doanh thu đăng ký',fn(sum(nw,s=>s.fee)/1e6),'triệu ₫','Học phí áp dụng của HV đăng ký trong tháng')+kpi('Thực thu phát sinh trong tháng',fn(cashM/1e6),'triệu ₫',`Trong đó từ HV đăng ký các tháng trước: ${fn(cashPrior/1e6)} triệu ₫`)+kpi('Theo khóa học',nw.length?'':'—','',cm||'Không có dữ liệu')+kpi('Hoàn thành chỉ tiêu tháng','Chưa có','','Workbook chưa có dữ liệu chỉ tiêu');
 const days=[];for(let d=a;d<=b;d=addD(d,1))days.push(d);
 const rows=days.map(d=>{const x=regIn(B,d,d);return{d,n:x.length,rev:sum(x,s=>s.fee),cash:cashIn(B,d,d)}}).filter(x=>x.n||x.cash);
 chart('c7',{type:'bar',data:{labels:days.map(d=>d.slice(8)),datasets:[{label:'HV mới',data:days.map(d=>regIn(B,d,d).length),backgroundColor:'#D3222B'}]},options:{plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,ticks:{precision:0}}}}});
 table('tb2d',[{t:'Ngày đăng ký',f:x=>fd(x.d),v:x=>x.d},{t:'Số HV mới',f:x=>x.n,n:1},{t:'Doanh thu đăng ký',f:x=>fm(x.rev),v:x=>x.rev,n:1},{t:'Thực thu trong ngày',f:x=>fm(x.cash),v:x=>x.cash,n:1}],rows,{name:'theo_ngay_'+m,sort:0,dir:1,ps:8});
 const pf=perf(B,a,b),tn=sum(pf,x=>x.n);
 table('tb2t',[{t:'Hạng',f:x=>x.rank,n:1},{t:'Tư vấn viên',f:x=>x.k},{t:'HV đăng ký mới',f:x=>x.n,n:1},{t:'Tổng học phí áp dụng',f:x=>fm(x.rev),v:x=>x.rev,n:1},{t:'Thực thu trong tháng',f:x=>fm(x.cash),v:x=>x.cash,n:1},{t:'Tỷ trọng',f:x=>pc(x.n,tn),v:x=>x.n,n:1}],pf.sort((x,y)=>y.n-x.n).map((x,i)=>({...x,rank:i+1})),{name:'top_tvv_'+m,sort:2,ps:10});
 srcBlock(B,a,b,'c8','tb2s',m)}
function srcBlock(B,a,b,cid,tid,tag,pa,pb){const rows=srcRows(B,a,b,pa,pb).sort((x,y)=>y.n-x.n),has=rows.some(x=>x.k!=='(Chưa có nguồn)'),tn=sum(rows,x=>x.n);
 if(has&&cid)chart(cid,{type:'bar',data:{labels:rows.map(x=>x.k),datasets:[{label:'HV',data:rows.map(x=>x.n),backgroundColor:'#D3222B'}]},options:{indexAxis:'y',plugins:{legend:{display:false}},scales:{x:{beginAtZero:true,ticks:{precision:0}}}}});else if(cid)empty(cid,'Chưa có dữ liệu nguồn tuyển sinh');
 const cols=[{t:'Nguồn',f:x=>x.k},{t:'HV đăng ký',f:x=>x.n,n:1},{t:'Tỷ trọng',f:x=>pc(x.n,tn),v:x=>x.n,n:1},{t:'Doanh thu đăng ký',f:x=>fm(x.rev),v:x=>x.rev,n:1},{t:'Thực thu trong kỳ',f:x=>fm(x.cash),v:x=>x.cash,n:1}];
 if(pa)cols.push({t:'Tuần trước',f:x=>x.pn,n:1},{t:'Chênh lệch',f:x=>(x.n-x.pn>0?'+':'')+(x.n-x.pn),v:x=>x.n-x.pn,n:1});
 table(tid,cols,rows,{name:'nguon_'+tag,sort:1,ps:10,click:pa?x=>listModal('Nguồn: '+x.k,x.v):null})}
// ================= TAB 3
function r3(){const B=base();let a=ST.wf&&ST.wt?ST.wf:ST.wk,b=ST.wf&&ST.wt?ST.wt:addD(ST.wk,6);const len=Math.round((P(b)-P(a))/864e5)+1,pb=addD(a,-1),pa=addD(a,-len);
 const nw=regIn(B,a,b),pn=regIn(B,pa,pb),pf=perf(B,a,b),ppf=new Map(perf(B,pa,pb).map(x=>[x.k,x]));
 $('t3k').innerHTML=kpi('Khoảng ngày đang xem',`<span style="font-size:16px">${fd(a)} – ${fd(b)}</span>`,'',len+' ngày; so với '+fd(pa)+' – '+fd(pb))+kpi('Học viên đăng ký mới',fn(nw.length),'HV',dtxt(nw.length,pn.length,'tuần trước'))+kpi('Doanh thu đăng ký',fn(sum(nw,s=>s.fee)/1e6),'triệu ₫',dtxt(sum(nw,s=>s.fee),sum(pn,s=>s.fee),'tuần trước'))+kpi('Thực thu phát sinh',fn(cashIn(B,a,b)/1e6),'triệu ₫',dtxt(cashIn(B,a,b),cashIn(B,pa,pb),'tuần trước'))+kpi('TVV có phát sinh tuyển sinh',fn(pf.length),'người','Đếm TVV có HV mới trong kỳ')+kpi('Hoàn thành chỉ tiêu tuần','Chưa có','','Workbook chưa có dữ liệu chỉ tiêu');
 segSync('s3','c9');const DN=['T2','T3','T4','T5','T6','T7','CN'],val=(x)=>ST.c9==='n'?x.length:sum(x,s=>s.fee);
 const ds=[];for(let i=0;i<Math.min(len,7);i++)ds.push(i);
 chart('c9',{type:'bar',data:{labels:ds.map(i=>(DN[(P(a).getDay()+6+i)%7])+' '+addD(a,i).slice(8)+'/'+addD(a,i).slice(5,7)),datasets:[{label:'Tuần này',data:ds.map(i=>val(regIn(B,addD(a,i),addD(a,i)))),backgroundColor:'#D3222B'},{label:'Tuần trước',data:ds.map(i=>val(regIn(B,addD(pa,i),addD(pa,i)))),backgroundColor:'#B8BCC3'}]},options:{plugins:{tooltip:tipM},scales:{y:{beginAtZero:true,ticks:{callback:ST.c9==='r'?v=>v/1e6+'tr':null,precision:0}}}}});
 const t5=[...pf].sort((x,y)=>y.n-x.n).slice(0,5);
 chart('c10',{type:'bar',data:{labels:t5.map(x=>x.k),datasets:[{label:'HV mới',data:t5.map(x=>x.n),backgroundColor:'#D3222B'}]},options:{indexAxis:'y',plugins:{legend:{display:false}},scales:{x:{beginAtZero:true,ticks:{precision:0}}}}});
 const tn=sum(pf,x=>x.n);
 table('tb3t',[{t:'Hạng',f:x=>x.rank,n:1},{t:'Tư vấn viên',f:x=>x.k},{t:'HV mới trong tuần',f:x=>x.n,n:1},{t:'Doanh thu đăng ký',f:x=>fm(x.rev),v:x=>x.rev,n:1},{t:'Thực thu trong tuần',f:x=>fm(x.cash),v:x=>x.cash,n:1},{t:'Tỷ trọng',f:x=>pc(x.n,tn),v:x=>x.n,n:1},{t:'Chênh lệch so tuần trước',f:x=>{const d=x.n-(ppf.get(x.k)?.n||0);return(d>0?'+':'')+d},v:x=>x.n-(ppf.get(x.k)?.n||0),n:1}],pf.sort((x,y)=>y.n-x.n).map((x,i)=>({...x,rank:i+1})),{name:'top_tvv_tuan',sort:2,ps:10});
 srcBlock(B,a,b,null,'tb3s','tuan',pa,pb)}
// ================= TAB 4
function r4(){let B=base();if(ST.stat)B=B.filter(s=>s.st===ST.stat);const a=ST.cf||(ST.mm?ST.mm+'-01':''),b=ST.ct||(ST.mm?mEnd(ST.mm):'');
 const reg=ST.mode==='reg',cohortL=(a||b)&&reg?regIn(B,a,b):B,c=cohort(cohortL),cash=(a||b)?cashIn(reg?cohortL:B,a,b):sum(B,s=>s.paid);
 $('t4k').innerHTML=kpi('Tổng doanh thu đăng ký',fn(c.rev/1e6),'triệu ₫',reg?'Theo ngày đăng ký trong kỳ':'Toàn bộ HV được lọc (chế độ thu tiền)')+kpi('Thực thu trong kỳ',fn(cash/1e6),'triệu ₫',reg?'Thu của HV đăng ký trong kỳ':'Theo ngày thanh toán trong kỳ')+kpi('Công nợ học phí còn lại',fn(c.owe/1e6),'triệu ₫','Lũy kế đến nay, HV "Chưa hoàn tất"','red')+kpi('Tỷ lệ hoàn tất theo giá trị',pc(c.paid,c.rev),'','Thanh toán lũy kế ÷ học phí áp dụng')+kpi('HV đã hoàn tất',fn(c.nDone),'HV','Công nợ = 0')+kpi('HV chưa hoàn tất',fn(c.nOwe),'HV',c.nRec+' HV cần đối soát','red')+kpi('Giá trị công nợ HV chưa hoàn tất',fn(c.owe/1e6),'triệu ₫','Học phí áp dụng − thanh toán hợp lệ');
 const ms=months.filter(m=>m>=(a||'').slice(0,7)&&(!b||m<=b.slice(0,7))),MR=ms.map(m=>{const e=mEnd(m),nw=regIn(B,m+'-01',e),upto=B.filter(s=>s.reg&&s.reg<=e);return{m,n:nw.length,rev:sum(nw,s=>s.fee),cash:cashIn(B,m+'-01',e),debt:sum(upto.filter(s=>s.fee!=null),s=>Math.max(0,s.fee-sum(s.pays.filter(p=>p[0]&&p[0]<=e),p=>p[1])))}});
 chart('c11',{type:'bar',data:{labels:MR.map(x=>mLabel(x.m)),datasets:[{label:'Doanh thu đăng ký',data:MR.map(x=>x.rev),backgroundColor:'#8A8F98'},{label:'Thực thu trong tháng',data:MR.map(x=>x.cash),backgroundColor:'#D3222B'},{label:'Công nợ cuối kỳ',data:MR.map(x=>x.debt),backgroundColor:'#D9730D'}]},options:{plugins:{tooltip:tipM},scales:ax(v=>v/1e6+'tr')}});
 table('tb4m',[{t:'Tháng',f:x=>mLabel(x.m),v:x=>x.m},{t:'HV đăng ký mới',f:x=>x.n,n:1},{t:'Doanh thu đăng ký',f:x=>fm(x.rev),v:x=>x.rev,n:1},{t:'Thực thu trong tháng',f:x=>fm(x.cash),v:x=>x.cash,n:1},{t:'Công nợ cuối kỳ',f:x=>fm(x.debt),v:x=>x.debt,n:1}],MR,{name:'theo_thang',sort:0,dir:1,ps:12});
 const ck=[...grp(B.filter(s=>(!(a||b)||!reg)||inR(s.reg,a,b)),s=>s.cl)].map(([k,v])=>{const cc=cohort(v),meta=CL[k]||{},kg=[...grp(v,s=>s.kg||'')].sort((x,y)=>y[1].length-x[1].length)[0][0];return{k,v,...cc,cash:cashIn(v,a,b),kg,meta,course:[...new Set(v.map(s=>s.co))].join(', ')}});
 table('tb4c',[{t:'Mã lớp',f:x=>x.k},{t:'Khóa học',f:x=>x.course},{t:'Tháng KG',f:x=>x.kg?'T'+x.kg:'—',v:x=>+x.kg||0},{t:'Lịch học',f:x=>x.meta.sched||'—'},{t:'Ca học',f:x=>x.meta.shift||'—'},{t:'Giáo viên',f:x=>x.meta.teacher||'—'},{t:'Số HV',f:x=>x.n,n:1},{t:'Học phí áp dụng',f:x=>fm(x.rev),v:x=>x.rev,n:1},{t:'Thực thu lũy kế',f:x=>fm(x.paid),v:x=>x.paid,n:1},{t:'Thực thu trong kỳ',f:x=>fm(x.cash),v:x=>x.cash,n:1},{t:'Công nợ còn lại',f:x=>fm(x.owe),v:x=>x.owe,n:1},{t:'Tỷ lệ hoàn tất',f:x=>pc(x.paid,x.rev),v:x=>x.rev?x.paid/x.rev:0,n:1}],ck,{name:'theo_lop',sort:7,click:x=>listModal('Lớp '+x.k,x.v),ps:10});
 $('t4q').innerHTML='<button class="btn" data-q4="all">Tất cả HV còn công nợ</button><button class="btn" data-q4="top">Công nợ cao → thấp</button><button class="btn" data-q4="xc">Xuất theo lớp</button><button class="btn" data-q4="xt">Xuất theo tư vấn viên</button>';
 const D4=B.filter(s=>s.st==='Chưa hoàn tất'&&(!(a||b)||!reg||inR(s.reg,a,b)));
 table('tb4d',[{t:'STT',f:x=>x.i,n:1},{t:'Họ và tên',f:x=>x.name},{t:'Mã HV',f:x=>x.id},{t:'Mã lớp',f:x=>x.cl},{t:'Khóa học',f:x=>x.co},{t:'Tháng KG',f:x=>x.kg?'T'+x.kg:'—',v:x=>x.kg||0},{t:'TVV phụ trách',f:x=>x.tv},{t:'Học phí áp dụng',f:x=>fm(x.fee),v:x=>x.fee,n:1},{t:'Đã thanh toán',f:x=>fm(x.paid),v:x=>x.paid,n:1},{t:'Còn phải thanh toán',f:x=>fm(x.owe),v:x=>x.owe,n:1},{t:'Ngày TT gần nhất',f:x=>fd(x.lastPay),v:x=>x.lastPay||''},{t:'Số lần TT',f:x=>x.pays.length,n:1},{t:'Ngày đăng ký',f:x=>fd(x.reg),v:x=>x.reg||''},stCol,{t:'Ghi chú',f:x=>x.note}].map(c=>c),D4.map((s,i)=>({...s,i:i+1})),{name:'cong_no',click:showStu,sort:9,ps:12});
 window.D4=D4;
 $('t4q').onclick=e=>{const k=e.target.dataset.q4;if(!k)return;const T=TB.tb4d;if(k==='all'){T.q='';T.sk=null;drawT('tb4d')}if(k==='top'){T.sk=9;T.sd=-1;drawT('tb4d')}
  if(k==='xc'||k==='xt'){const f=k==='xc'?s=>s.cl:s=>s.tv,rows=[...grp(D4,f)].map(([g,v])=>({g,n:v.length,owe:sum(v,s=>s.owe),list:v.map(s=>s.name).join('; ')}));xlsx('cong_no_theo_'+(k==='xc'?'lop':'tvv'),[{t:k==='xc'?'Lớp':'Tư vấn viên',f:x=>x.g},{t:'Số HV còn nợ',f:x=>x.n},{t:'Công nợ',f:x=>x.owe},{t:'Học viên',f:x=>x.list}],rows.sort((x,y)=>y.owe-x.owe))}}}
// ================= render
const T={t1:['Tổng quan tuyển sinh',r1],t2:['Báo cáo tuyển sinh theo tháng',r2],t3:['Báo cáo tuyển sinh theo tuần',r3],t4:['Doanh thu, thực thu và công nợ',r4]};
function render(){document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('on',t.id===ST.tab));document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('on',b.dataset.t===ST.tab));$('ttl').textContent=T[ST.tab][0];
 ['t1f','t2f','t3f','t4f'].forEach(id=>{const e=$(id);e.querySelectorAll('[data-st]').forEach(i=>{if(i.value!==String(ST[i.dataset.st]))i.value=ST[i.dataset.st]})});
 T[ST.tab][1]()}
$('upd').textContent='Dữ liệu đến '+fd(D.today)+' · '+S.length+' học viên'+(D.meta&&D.meta.updatedAt?' · cập nhật '+new Date(D.meta.updatedAt).toLocaleString('vi-VN'):'');
$('dq').onclick=()=>{$('mt').textContent='Chất lượng dữ liệu & điểm cần đối soát';const g=grp(D.flags.map(f=>({ref:f[0],t:f[1],v:f[2]})),x=>x.t);
 $('mb').innerHTML='<div class="na">Dashboard không tự sửa dữ liệu gốc; mọi điều chỉnh bên dưới đều được ghi lại để bạn xác nhận.</div><div id="tbq"></div>';md.classList.add('on');
 table('tbq',[{t:'Loại vấn đề',f:x=>x.t},{t:'Số lượng',f:x=>x.n,n:1},{t:'Ví dụ',f:x=>x.ex}],[...g].map(([t,v])=>({t,n:v.length,ex:v.slice(0,3).map(x=>x.ref+' ('+x.v+')').join('; ')})),{name:'chat_luong_du_lieu',sort:1,ps:15})};
buildCtl();render();
return{destroy(){document.removeEventListener('change',onChange);Object.values(CH).forEach(c=>{try{c.destroy()}catch(e){}})},tab:()=>ST.tab}
}
