import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Search, Filter, CheckCircle, Clock, FileText, AlertCircle, 
  Plus, Camera, Layers, Calendar, Loader, Wrench, Edit, Settings, MessageSquare, Star, Trash2
} from 'lucide-react';
import html2canvas from 'html2canvas';

// ==========================================
// 1. ตั้งค่า API ของ Google Sheets (นำ URL มาใส่ตรงนี้)
// ==========================================
const GOOGLE_SHEET_API_URL = 'https://script.google.com/macros/s/AKfycbwGsKdgbdGW6w6Be7y_Ye3XmsqYgAvM6sF6hU21IteCFHR93QYDUMHo8VNdiaDHoDHg/exec';

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [isExporting, setIsExporting] = useState(false);
  const [isCopying, setIsCopying] = useState(false); 
  const [modalType, setModalType] = useState(null); 
  
  const defaultForm = {
    id: null, wo: '', title: '', category: '', equipment: '', plan: '', status: 'Pending', blocker: '', blockerOther: '', remark: '', isHighlight: false
  };
  const [formData, setFormData] = useState(defaultForm);
  const reportRef = useRef(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      if (!GOOGLE_SHEET_API_URL || GOOGLE_SHEET_API_URL === 'ใส่_URL_ของคุณตรงนี้') throw new Error("No API URL");
      const response = await fetch(GOOGLE_SHEET_API_URL);
      const data = await response.json();
      
      const processedData = data.map(t => {
        let r = String(t.remark || '');
        let hl = false;
        let cat = '';
        
        if (r.includes('[HL]')) {
          hl = true;
          r = r.replace('[HL]', '').trim();
        }
        
        const catMatch = r.match(/\[CAT:(.*?)\]/);
        if (catMatch) {
          cat = catMatch[1];
          r = r.replace(catMatch[0], '').trim();
        }
        
        return { ...t, remark: r, isHighlight: hl, category: cat };
      }).filter(t => t.status !== 'Deleted');
      
      setTasks(processedData);
    } catch (error) {
      setTasks([]); 
    } finally {
      setIsLoading(false);
    }
  };

  const uniqueCategories = useMemo(() => {
    const cats = tasks.map(t => t.category).filter(c => c && c.trim() !== '');
    return [...new Set(cats)];
  }, [tasks]);

  const openActionMenu = (task) => {
    let currentBlocker = task.blocker || '';
    let currentOther = '';
    if (currentBlocker.startsWith('อื่นๆ: ')) {
      currentOther = currentBlocker.replace('อื่นๆ: ', '');
      currentBlocker = 'อื่นๆ';
    }
    setFormData({ ...task, blocker: currentBlocker, blockerOther: currentOther });
    setModalType('action');
  };

  const openAddForm = () => {
    setFormData(defaultForm);
    setModalType('form');
  };

  const handleSaveTask = async () => {
    if (!formData.title || !formData.wo) return alert('กรุณากรอก Work Order และชื่องาน');
    
    let finalBlocker = formData.blocker;
    if (formData.blocker === 'อื่นๆ' && formData.blockerOther) {
      finalBlocker = `อื่นๆ: ${formData.blockerOther}`;
    }

    const taskData = { ...formData, blocker: finalBlocker };

    if (formData.id) {
      setTasks(prev => prev.map(t => t.id === formData.id ? taskData : t));
    } else {
      taskData.id = Date.now();
      taskData.completedDate = null;
      setTasks(prev => [taskData, ...prev]);
    }
    setModalType(null); 

    if (GOOGLE_SHEET_API_URL && GOOGLE_SHEET_API_URL !== 'ใส่_URL_ของคุณตรงนี้') {
      try {
        const payloadData = { ...taskData };
        let finalRemark = payloadData.remark || '';
        
        if (payloadData.category) finalRemark = `[CAT:${payloadData.category}] ${finalRemark}`.trim();
        if (payloadData.isHighlight) finalRemark = `[HL] ${finalRemark}`.trim();
        
        payloadData.remark = finalRemark;

        await fetch(GOOGLE_SHEET_API_URL, { 
          method: 'POST', 
          body: JSON.stringify({ action: formData.id ? 'update' : 'add', data: payloadData }) 
        });
      } catch (err) {}
    }
  };

  const handleCompleteTask = async () => {
    const today = new Date().toISOString().split('T')[0];
    const taskId = formData.id;
    
    setTasks(prev => prev.map(t => 
      t.id === taskId ? { ...t, status: 'Completed', blocker: '', completedDate: today, isHighlight: false } : t
    ));
    setModalType(null); 

    if (GOOGLE_SHEET_API_URL && GOOGLE_SHEET_API_URL !== 'ใส่_URL_ของคุณตรงนี้') {
      try {
        await fetch(GOOGLE_SHEET_API_URL, {
          method: 'POST',
          body: JSON.stringify({ action: 'updateStatus', id: taskId, status: 'Completed', date: today })
        });
      } catch (err) {}
    }
  };

  const handleDeleteTask = async () => {
    if (!window.confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบงาน ${formData.wo} ?\n(ข้อมูลจะถูกลบออกจากรายงานทั้งหมด)`)) return;
    
    const taskId = formData.id;
    setTasks(prev => prev.filter(t => t.id !== taskId));
    setModalType(null);

    if (GOOGLE_SHEET_API_URL && GOOGLE_SHEET_API_URL !== 'ใส่_URL_ของคุณตรงนี้') {
      try {
        await fetch(GOOGLE_SHEET_API_URL, {
          method: 'POST',
          body: JSON.stringify({ action: 'updateStatus', id: taskId, status: 'Deleted', date: new Date().toISOString().split('T')[0] })
        });
      } catch (err) {}
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return String(dateString).split('T')[0];
  };

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      if (task.status === 'Completed' && task.completedDate) {
        const diffTime = Math.abs(new Date() - new Date(task.completedDate));
        if (Math.ceil(diffTime / (1000 * 60 * 60 * 24)) > 30) return false;
      }
      const searchMatch = (task.title + task.wo + task.equipment + task.category + (task.remark || '')).toLowerCase().includes(searchTerm.toLowerCase());
      const statusMatch = statusFilter === 'All' ? true : statusFilter === 'Blocked' ? (task.blocker && task.status !== 'Completed') : task.status === statusFilter;
      return searchMatch && statusMatch;
    });
  }, [tasks, searchTerm, statusFilter]);

  const sortByCategory = (a, b) => {
    const catA = (a.category || '\uFFFF').toLowerCase(); 
    const catB = (b.category || '\uFFFF').toLowerCase();
    if (catA < catB) return -1;
    if (catA > catB) return 1;
    return 0;
  };

  const highlightedTasks = filteredTasks.filter(t => t.isHighlight && t.status !== 'Completed').sort(sortByCategory);
  const normalTasks = filteredTasks.filter(t => !t.isHighlight || t.status === 'Completed').sort(sortByCategory);
  const reportTasks = [...highlightedTasks, ...normalTasks];

  const isDense = reportTasks.length > 26; 
  const isVeryDense = reportTasks.length > 40; 
  const tablePad = isVeryDense ? 'p-1' : isDense ? 'p-1.5' : 'p-2';
  const textSize = isVeryDense ? 'text-[9px]' : isDense ? 'text-[10px]' : 'text-xs';

  const midPoint = Math.ceil(reportTasks.length / 2);
  const leftTasks = reportTasks.slice(0, midPoint);
  const rightTasks = reportTasks.slice(midPoint);

  const activeTasks = tasks.filter(t => t.status !== 'Completed');
  const stats = {
    pending: tasks.filter(t => t.status === 'Pending').length,
    scaffold: activeTasks.filter(t => t.blocker === 'รอนั่งร้าน').length,
    spare: activeTasks.filter(t => t.blocker === 'รอ Spare Part').length,
    outage: activeTasks.filter(t => t.blocker === 'รอ Outage').length,
    contractor: activeTasks.filter(t => t.blocker === 'รอผู้รับเหมา').length,
    manpower: activeTasks.filter(t => t.blocker === 'รอ Manpower').length,
    other: activeTasks.filter(t => t.blocker && t.blocker.startsWith('อื่นๆ')).length,
  };

  const blockerKPIs = [
    { key: 'outage', label: 'รอ Outage', count: stats.outage, border: 'border-l-red-500', text: 'text-red-600' },
    { key: 'spare', label: 'รอ Spare Part', count: stats.spare, border: 'border-l-purple-500', text: 'text-purple-600' },
    { key: 'scaffold', label: 'รอนั่งร้าน', count: stats.scaffold, border: 'border-l-orange-500', text: 'text-orange-600' },
    { key: 'contractor', label: 'รอผู้รับเหมา', count: stats.contractor, border: 'border-l-emerald-500', text: 'text-emerald-600' },
    { key: 'manpower', label: 'รอ Manpower', count: stats.manpower, border: 'border-l-yellow-500', text: 'text-yellow-600' },
    { key: 'other', label: 'ติดปัญหาอื่นๆ', count: stats.other, border: 'border-l-slate-500', text: 'text-slate-600' },
  ];
  const activeBlockers = blockerKPIs.filter(b => b.count > 0); 

  const exportToA4 = async () => {
    setIsExporting(true);
    const element = reportRef.current;
    if (!element) return;
    try {
      element.style.display = 'block';
      const canvas = await html2canvas(element, { scale: 4, useCORS: true, backgroundColor: '#ffffff' });
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `EPT_LV_Backlog_${new Date().toISOString().split('T')[0]}.png`;
      link.click();
    } catch (err) {} finally {
      element.style.display = 'none';
      setIsExporting(false);
    }
  };

  const copyToLine = async () => {
    setIsCopying(true);
    const element = reportRef.current;
    if (!element) return;
    try {
      element.style.display = 'block';
      const canvas = await html2canvas(element, { scale: 4, useCORS: true, backgroundColor: '#ffffff' });
      
      canvas.toBlob(async (blob) => {
        try {
          const item = new ClipboardItem({ 'image/png': blob });
          await navigator.clipboard.write([item]);
          alert('คัดลอกรูปภาพรายงานสำเร็จแล้ว! 🎉\nสามารถไปที่แชท LINE แล้วกด "วาง (Paste)" ได้เลยครับ');
        } catch (err) {
          alert('เบราว์เซอร์ไม่รองรับการก๊อปปี้รูป กรุณาใช้ปุ่ม Export A4 แทนครับ');
        } finally {
          element.style.display = 'none';
          setIsCopying(false);
        }
      }, 'image/png');
    } catch (err) {
      element.style.display = 'none';
      setIsCopying(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
        <Loader className="w-10 h-10 text-blue-500 animate-spin mb-4" />
        <p className="text-gray-600 font-medium">กำลังโหลดข้อมูล...</p>
      </div>
    );
  }

  // UI Component สำหรับ Render ตารางใน A4 (แก้ไขบั๊กสีทับข้อความเรียบร้อย)
  const ReportTable = ({ tasksToRender }) => (
    <table className="w-full text-left border-collapse border border-slate-300 shadow-sm rounded-lg overflow-hidden" style={{ tableLayout: 'fixed' }}>
      <thead>
        <tr className={`bg-slate-100 text-slate-700 ${textSize} border-b border-slate-300`}>
          <th className={`${tablePad} border-r border-slate-300 font-bold w-[12%] text-center`}>WO</th>
          <th className={`${tablePad} border-r border-slate-300 font-bold w-[30%]`}>Description / Tag</th>
          <th className={`${tablePad} border-r border-slate-300 font-bold w-[14%] text-center`}>Plan</th>
          <th className={`${tablePad} border-r border-slate-300 font-bold w-[12%] text-center`}>Status</th>
          <th className={`${tablePad} border-r border-slate-300 font-bold w-[15%]`}>Blockers</th>
          <th className={`${tablePad} font-bold w-[17%]`}>Remark</th>
        </tr>
      </thead>
      <tbody>
        {tasksToRender.map(t => {
          const isHl = t.isHighlight && t.status !== 'Completed';
          const isComp = t.status === 'Completed';
          
          let rowClass = 'bg-white text-slate-800';
          let woClass = 'text-blue-700';
          if (isHl) { rowClass = 'bg-yellow-50 font-semibold text-slate-900'; woClass = 'text-yellow-700'; }
          else if (isComp) { rowClass = 'bg-green-50 text-green-800'; woClass = 'text-green-700'; }

          return (
            <tr key={t.id} className={`${textSize} border-b border-slate-200 ${rowClass}`}>
              <td className={`${tablePad} border-r border-slate-200 font-bold text-center ${woClass}`}>
                {isHl && <span>⭐ </span>}{t.wo}
              </td>
              <td className={`${tablePad} border-r border-slate-200 align-top`}>
                <div className="font-bold mb-1" style={{ wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: '1.3' }}>{t.title}</div>
                <div style={{ display: 'block', lineHeight: '1.4' }}>
                  {t.category && <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded-sm font-medium mr-1 border ${isComp ? 'bg-green-100 border-green-200 text-green-800' : 'bg-slate-100 border-slate-200 text-slate-700'}`}>{t.category}</span>}
                  <span className="inline-block text-[10px] text-slate-500 font-normal">Tag: {t.equipment || '-'}</span>
                </div>
              </td>
              <td className={`${tablePad} border-r border-slate-200 text-center align-top`}>{formatDate(t.plan)}</td>
              <td className={`${tablePad} border-r border-slate-200 text-center font-bold align-top`}>{t.status}</td>
              <td className={`${tablePad} border-r border-slate-200 align-top ${t.blocker && !isComp ? 'text-red-600 font-bold' : ''}`}>
                <div style={{ wordBreak: 'break-word', whiteSpace: 'normal' }}>{t.blocker || '-'}</div>
              </td>
              <td className={`${tablePad} align-top`}>
                <div style={{ wordBreak: 'break-word', whiteSpace: 'normal' }}>{t.remark || '-'}</div>
              </td>
            </tr>
          );
        })}
        {tasksToRender.length === 0 && (
          <tr><td colSpan="6" className={`${tablePad} text-center text-slate-400 bg-white`}>ไม่มีข้อมูล</td></tr>
        )}
      </tbody>
    </table>
  );

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Wrench className="text-blue-600" />
              EPT-LV Maintenance Backlog
            </h1>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={copyToLine} disabled={isCopying} className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 shadow-sm transition-colors disabled:opacity-50">
              {isCopying ? <Loader className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />} Copy ภาพลง LINE
            </button>
            <button onClick={exportToA4} disabled={isExporting} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg shadow-sm disabled:opacity-50 hover:bg-gray-50">
              {isExporting ? <Loader className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />} Export (A4)
            </button>
            <button onClick={openAddForm} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm transition-colors">
              <Plus className="w-4 h-4" /> เพิ่มงานค้างใหม่
            </button>
          </div>
        </div>

        {/* Dashboard สรุป */}
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[150px] bg-white p-4 rounded-xl shadow-sm border-l-4 border-l-blue-500">
            <div className="text-slate-500 text-sm font-medium">Pending ทั้งหมด</div>
            <div className="text-3xl font-bold">{stats.pending}</div>
          </div>
          
          {activeBlockers.map(b => (
            <div key={b.key} className={`flex-1 min-w-[150px] bg-white p-4 rounded-xl shadow-sm border-l-4 ${b.border}`}>
              <div className="text-slate-500 text-sm font-medium">{b.label}</div>
              <div className={`text-3xl font-bold ${b.text}`}>{b.count}</div>
            </div>
          ))}
        </div>

        {/* ระบบ Filter */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input type="text" placeholder="ค้นหา Work Order, ชื่องาน, หมวดหมู่, Tag หรือ Remark..." 
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <div className="relative min-w-[200px]">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
            <select className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
              value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="All">สถานะทั้งหมด</option>
              <option value="Pending">กำลังดำเนินการ (Pending)</option>
              <option value="Blocked">ติดปัญหา (Blocked)</option>
              <option value="Completed">เสร็จสิ้น (Completed)</option>
            </select>
          </div>
        </div>

        {/* ---------------- ตารางงาน HIGHLIGHT (หน้าเว็บ) ---------------- */}
        {highlightedTasks.length > 0 && (
          <div className="mb-6 bg-white rounded-xl shadow-sm border-2 border-yellow-300 overflow-hidden">
            <div className="bg-yellow-50 text-yellow-800 font-bold p-4 border-b border-yellow-200 flex items-center gap-2">
              <Star className="w-5 h-5 fill-yellow-500 text-yellow-500" />
              งาน Highlight เร่งด่วน / สำคัญ ({highlightedTasks.length})
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-yellow-50/50 text-yellow-800 text-sm border-b border-yellow-200">
                    <th className="p-4 font-semibold">WO</th>
                    <th className="p-4 font-semibold min-w-[200px]">Description</th>
                    <th className="p-4 font-semibold">Plan Date</th>
                    <th className="p-4 font-semibold">Status</th>
                    <th className="p-4 font-semibold min-w-[150px]">Blockers</th>
                    <th className="p-4 font-semibold min-w-[150px]">Remark</th>
                    <th className="p-4 font-semibold text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-yellow-100">
                  {highlightedTasks.map((task) => (
                    <tr key={task.id} className="hover:bg-yellow-50 group transition-colors">
                      <td className="p-4"><span className="px-2.5 py-1 rounded bg-yellow-100 text-yellow-800 text-sm font-bold">{task.wo}</span></td>
                      <td className="p-4">
                        <div className="font-bold text-slate-900">{task.title}</div>
                        <div className="flex gap-2 items-center mt-1">
                          {task.category && <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-200 text-yellow-800 font-medium">{task.category}</span>}
                          <span className="text-xs text-slate-500">Tag: {task.equipment || '-'}</span>
                        </div>
                      </td>
                      <td className="p-4 text-sm text-slate-600">{task.plan ? <div className="flex items-center gap-1.5"><Calendar className="w-4 h-4"/> {formatDate(task.plan)}</div> : '-'}</td>
                      <td className="p-4"><span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border bg-amber-50 text-amber-700 border-amber-200">{task.status}</span></td>
                      <td className="p-4 text-sm">{task.blocker ? <span className="text-red-600 font-semibold">{task.blocker}</span> : '-'}</td>
                      <td className="p-4 text-sm text-slate-600">{task.remark || '-'}</td>
                      <td className="p-4 text-center">
                        <button onClick={() => openActionMenu(task)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
                          <Settings className="w-5 h-5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ---------------- ตารางงานปกติ (หน้าเว็บ) ---------------- */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          {highlightedTasks.length > 0 && (
            <div className="bg-slate-50 text-slate-600 font-bold p-4 border-b border-slate-200 flex items-center gap-2">
              <Layers className="w-5 h-5" />
              รายการงานทั่วไป
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600 text-sm border-b">
                  <th className="p-4 font-semibold">WO</th>
                  <th className="p-4 font-semibold min-w-[200px]">Description</th>
                  <th className="p-4 font-semibold">Plan Date</th>
                  <th className="p-4 font-semibold">Status</th>
                  <th className="p-4 font-semibold min-w-[150px]">Blockers</th>
                  <th className="p-4 font-semibold min-w-[150px]">Remark</th>
                  <th className="p-4 font-semibold text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {normalTasks.length === 0 ? (
                  <tr><td colSpan="7" className="p-8 text-center text-slate-500">ไม่มีข้อมูลงานในหมวดหมู่นี้</td></tr>
                ) : (
                  normalTasks.map((task) => (
                    <tr key={task.id} className={`hover:bg-slate-50 group ${task.status === 'Completed' ? 'bg-green-50/30' : ''}`}>
                      <td className="p-4"><span className="px-2.5 py-1 rounded bg-slate-100 text-slate-700 text-sm">{task.wo}</span></td>
                      <td className="p-4">
                        <div className="font-bold text-slate-800">{task.title}</div>
                        <div className="flex gap-2 items-center mt-1">
                          {task.category && <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${task.status === 'Completed' ? 'bg-green-100 text-green-700' : 'bg-blue-50 text-blue-600'}`}>{task.category}</span>}
                          <span className="text-xs text-slate-500">Tag: {task.equipment || '-'}</span>
                        </div>
                      </td>
                      <td className="p-4 text-sm text-slate-600">
                        {task.plan ? <div className="flex items-center gap-1.5"><Calendar className="w-4 h-4 text-slate-400"/> {formatDate(task.plan)}</div> : '-'}
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border
                          ${task.status === 'Completed' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                          {task.status}
                        </span>
                      </td>
                      <td className="p-4 text-sm">{task.blocker && task.status !== 'Completed' ? <span className="text-red-600">{task.blocker}</span> : '-'}</td>
                      <td className="p-4 text-sm text-slate-600">{task.remark || '-'}</td>
                      <td className="p-4 text-center">
                        <button onClick={() => openActionMenu(task)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                          <Settings className="w-5 h-5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal Actions */}
      {modalType === 'action' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 text-center">
            <h3 className="text-lg font-bold text-slate-800 mb-1">จัดการงาน: {formData.wo}</h3>
            <p className="text-slate-500 text-sm mb-6 h-10 overflow-hidden">{formData.title}</p>
            <div className="space-y-3">
              {formData.status !== 'Completed' && (
                <button onClick={handleCompleteTask} className="w-full flex items-center justify-center gap-2 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 font-medium transition-colors">
                  <CheckCircle className="w-5 h-5" /> ยืนยันว่างานเสร็จสิ้นแล้ว
                </button>
              )}
              <button onClick={() => setModalType('form')} className="w-full flex items-center justify-center gap-2 py-3 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 font-medium transition-colors">
                <Edit className="w-5 h-5" /> แก้ไขข้อมูลงาน
              </button>
              
              <button onClick={handleDeleteTask} className="w-full flex items-center justify-center gap-2 py-3 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 font-medium transition-colors border border-red-100">
                <Trash2 className="w-5 h-5" /> ลบงานนี้ทิ้ง
              </button>
              
              <button onClick={() => setModalType(null)} className="w-full py-3 text-slate-500 hover:bg-slate-100 rounded-lg font-medium transition-colors mt-2">
                ยกเลิก / ปิด
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Form */}
      {modalType === 'form' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6">
            <h2 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2">
              {formData.id ? 'แก้ไขข้อมูลงาน' : 'เพิ่มงานค้างใหม่ (EPT-LV)'}
            </h2>
            <div className="space-y-4">
              
              <div className="col-span-2">
                <label className="flex items-center gap-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg cursor-pointer hover:bg-yellow-100 transition-colors">
                  <input type="checkbox" className="w-5 h-5 accent-yellow-600" 
                    checked={formData.isHighlight} onChange={e => setFormData({...formData, isHighlight: e.target.checked})} />
                  <span className="font-bold text-yellow-800 flex items-center gap-1">
                    <Star className="w-5 h-5 fill-yellow-500 text-yellow-500" />
                    ตั้งเป็นงาน Highlight (เร่งด่วน / สำคัญ)
                  </span>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-700">Work Order (WO)</label>
                  <input type="text" className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none" 
                    value={formData.wo} onChange={e => setFormData({...formData, wo: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-700">Plan Date</label>
                  <input type="date" className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none" 
                    value={formatDate(formData.plan)} onChange={e => setFormData({...formData, plan: e.target.value})} />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1 text-slate-700">ชื่องาน (Description)</label>
                <input type="text" className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none" 
                  value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-700">หมวดหมู่ (Category)</label>
                  <input type="text" list="category-options" className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none" 
                    value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} 
                    placeholder="เช่น ไฟฟ้า, ซ่อม..." />
                  <datalist id="category-options">
                    {uniqueCategories.map((c, i) => <option key={i} value={c} />)}
                  </datalist>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-700">Tag อุปกรณ์</label>
                  <input type="text" className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none" 
                    value={formData.equipment} onChange={e => setFormData({...formData, equipment: e.target.value})} />
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <label className="block text-sm font-medium mb-1 text-slate-700">สาเหตุที่ติด (Blocker)</label>
                <select className="w-full border border-slate-300 rounded-lg px-3 py-2 mb-2 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                  value={formData.blocker} onChange={e => setFormData({...formData, blocker: e.target.value, blockerOther: ''})}>
                  <option value="">-- ไม่ติด (ดำเนินการได้) --</option>
                  <option value="รอนั่งร้าน">รอนั่งร้าน</option>
                  <option value="รอ Spare Part">รอ Spare Part</option>
                  <option value="รอ Outage">รอ Outage</option>
                  <option value="รอ Manpower">รอ Manpower</option>
                  <option value="รอผู้รับเหมา">รอผู้รับเหมา</option>
                  <option value="อื่นๆ">อื่นๆ (ระบุ...)</option>
                </select>
                {formData.blocker === 'อื่นๆ' && (
                  <input type="text" className="w-full border-2 rounded-lg px-3 py-2 border-orange-400 focus:ring-2 focus:ring-orange-500 focus:outline-none" placeholder="โปรดระบุสาเหตุ..."
                    value={formData.blockerOther} onChange={e => setFormData({...formData, blockerOther: e.target.value})} autoFocus />
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1 text-slate-700">Remark (หมายเหตุเพิ่มเติม)</label>
                <input type="text" className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none" 
                  value={formData.remark} onChange={e => setFormData({...formData, remark: e.target.value})} />
              </div>
            </div>
            
            <div className="mt-6 flex justify-between items-center">
              {formData.id ? (
                <button onClick={handleDeleteTask} className="flex items-center gap-1 px-3 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors text-sm font-medium">
                  <Trash2 className="w-4 h-4" /> ลบทิ้ง
                </button>
              ) : <div></div>}
              
              <div className="flex gap-2">
                <button onClick={() => setModalType(null)} className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors">ยกเลิก</button>
                <button onClick={handleSaveTask} className="px-5 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 shadow-sm transition-colors">บันทึกข้อมูล</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Hidden Export Template (Report A4 แนวนอน 2 คอลัมน์) ---------------- */}
      <div ref={reportRef} className="hidden bg-white p-8 mx-auto" style={{ width: '1123px', minHeight: '794px', boxSizing: 'border-box' }}>
          
          <div className="flex justify-between items-end mb-6 border-b-2 border-slate-100 pb-4">
            <div>
              <h1 className="text-3xl font-extrabold text-slate-800 mb-1 tracking-tight">EPT-LV Maintenance Backlog</h1>
              <p className="text-slate-500 font-medium">Last Update: {new Date().toLocaleDateString('th-TH')} | แผนก: EPT-LV</p>
            </div>
            <div className="flex gap-2">
              <div className="bg-blue-50 border border-blue-200 px-4 py-2 rounded-lg text-center">
                <div className="text-xs font-bold text-blue-600 uppercase">Total Pending</div>
                <div className="text-xl font-extrabold text-blue-700">{stats.pending}</div>
              </div>
            </div>
          </div>
          
          {activeBlockers.length > 0 && (
            <div className="flex gap-3 mb-6 w-full">
              {activeBlockers.map(b => (
                <div key={b.key} className={`flex-1 bg-white p-3 rounded-xl border border-slate-200 border-l-4 ${b.border} shadow-sm`}>
                    <div className="text-slate-500 text-xs font-bold mb-1 uppercase">{b.label}</div>
                    <div className={`text-2xl font-extrabold ${b.text}`}>{b.count}</div>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-6 items-start w-full">
            <ReportTable tasksToRender={leftTasks} />
            <ReportTable tasksToRender={rightTasks} />
          </div>
          
          <div className="mt-4 text-center text-xs text-slate-400 font-medium pt-2">
            * สรุปรายงานสถานะงานค้าง งาน Highlight และงานเสร็จสิ้น โดยแผนก EPT-LV
          </div>
      </div>
    </div>
  );
}