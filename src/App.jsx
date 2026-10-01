import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Search, Filter, CheckCircle, Clock, FileText, AlertCircle, 
  Plus, Camera, Layers, Calendar, Loader, Wrench, Edit, Settings 
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
  const [modalType, setModalType] = useState(null); 
  
  const defaultForm = {
    id: null, wo: '', title: '', equipment: '', plan: '', status: 'Pending', blocker: '', blockerOther: '', remark: ''
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
      setTasks(data);
    } catch (error) {
      setTasks([]); 
    } finally {
      setIsLoading(false);
    }
  };

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
        await fetch(GOOGLE_SHEET_API_URL, { 
          method: 'POST', 
          body: JSON.stringify({ action: formData.id ? 'update' : 'add', data: taskData }) 
        });
      } catch (err) {}
    }
  };

  const handleCompleteTask = async () => {
    const today = new Date().toISOString().split('T')[0];
    const taskId = formData.id;
    
    setTasks(prev => prev.map(t => 
      t.id === taskId ? { ...t, status: 'Completed', blocker: '', completedDate: today } : t
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

  // ฟังก์ชันตัดเวลาออก ให้เหลือแค่วันที่ (YYYY-MM-DD)
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
      const searchMatch = (task.title + task.wo + task.equipment + (task.remark || '')).toLowerCase().includes(searchTerm.toLowerCase());
      const statusMatch = statusFilter === 'All' ? true : statusFilter === 'Blocked' ? (task.blocker && task.status !== 'Completed') : task.status === statusFilter;
      return searchMatch && statusMatch;
    });
  }, [tasks, searchTerm, statusFilter]);

  const exportToA4 = async () => {
    setIsExporting(true);
    const element = reportRef.current;
    if (!element) return;
    try {
      element.style.display = 'block';
      const canvas = await html2canvas(element, { scale: 3, useCORS: true, backgroundColor: '#ffffff' });
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `EPT_LV_Backlog_${new Date().toISOString().split('T')[0]}.png`;
      link.click();
    } catch (err) {} finally {
      element.style.display = 'none';
      setIsExporting(false);
    }
  };

  // คำนวณสถานะ Blocker แต่ละประเภท (นับเฉพาะงานที่ยังไม่ Completed)
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

  // สร้างกล่องเฉพาะอันที่มีค่า > 0
  const blockerKPIs = [
    { key: 'outage', label: 'รอ Outage', count: stats.outage, border: 'border-l-red-500', text: 'text-red-600' },
    { key: 'spare', label: 'รอ Spare Part', count: stats.spare, border: 'border-l-purple-500', text: 'text-purple-600' },
    { key: 'scaffold', label: 'รอนั่งร้าน', count: stats.scaffold, border: 'border-l-orange-500', text: 'text-orange-600' },
    { key: 'contractor', label: 'รอผู้รับเหมา', count: stats.contractor, border: 'border-l-emerald-500', text: 'text-emerald-600' },
    { key: 'manpower', label: 'รอ Manpower', count: stats.manpower, border: 'border-l-yellow-500', text: 'text-yellow-600' },
    { key: 'other', label: 'ติดปัญหาอื่นๆ', count: stats.other, border: 'border-l-slate-500', text: 'text-slate-600' },
  ];
  const activeBlockers = blockerKPIs.filter(b => b.count > 0); // โชว์เฉพาะ > 0

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
        <Loader className="w-10 h-10 text-blue-500 animate-spin mb-4" />
        <p className="text-gray-600 font-medium">กำลังโหลดข้อมูล...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Wrench className="text-blue-600" />
              EPT-LV Maintenance Backlog
            </h1>
          </div>
          <div className="flex gap-2">
            <button onClick={exportToA4} disabled={isExporting} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg shadow-sm disabled:opacity-50">
              {isExporting ? <Loader className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />} Export (A4)
            </button>
            <button onClick={openAddForm} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm">
              <Plus className="w-4 h-4" /> เพิ่มงานค้างใหม่
            </button>
          </div>
        </div>

        {/* ระบบแสดงผลกล่อง KPI อัจฉริยะ */}
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[150px] bg-white p-4 rounded-xl shadow-sm border-l-4 border-l-blue-500">
            <div className="text-slate-500 text-sm">Pending ทั้งหมด</div>
            <div className="text-3xl font-bold">{stats.pending}</div>
          </div>
          
          {/* แสดงกล่อง Blocker เฉพาะอันที่มีค่า > 0 */}
          {activeBlockers.map(b => (
            <div key={b.key} className={`flex-1 min-w-[150px] bg-white p-4 rounded-xl shadow-sm border-l-4 ${b.border}`}>
              <div className="text-slate-500 text-sm">{b.label}</div>
              <div className={`text-3xl font-bold ${b.text}`}>{b.count}</div>
            </div>
          ))}

          {/* ถ้าไม่มีงานติด Blocker เลย จะแสดงกล่องนี้แทน */}
          {activeBlockers.length === 0 && (
            <div className="flex-1 min-w-[150px] bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex items-center justify-center text-slate-400">
              ไม่มีงานติดปัญหา (Blocker) 🎉
            </div>
          )}
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input type="text" placeholder="ค้นหา Work Order, ชื่องาน, Tag หรือ Remark..." 
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

        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
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
                {filteredTasks.length === 0 ? (
                  <tr><td colSpan="7" className="p-8 text-center text-slate-500">ไม่มีข้อมูลงานค้างในระบบ</td></tr>
                ) : (
                  filteredTasks.map((task) => (
                    <tr key={task.id} className="hover:bg-slate-50 group">
                      <td className="p-4"><span className="px-2.5 py-1 rounded bg-blue-50 text-blue-700 text-sm">{task.wo}</span></td>
                      <td className="p-4 font-medium text-slate-800">{task.title} <div className="text-xs text-slate-500 mt-1">Tag: {task.equipment || '-'}</div></td>
                      <td className="p-4 text-sm text-slate-600">
                        {/* ตัดเวลาออกแล้วแสดงแค่วันที่ */}
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
                        <button onClick={() => openActionMenu(task)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="จัดการ/แก้ไขงาน">
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

      {/* Modal Actions ... (คงเดิม) */}
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
              <button onClick={() => setModalType(null)} className="w-full py-3 text-slate-500 hover:bg-slate-100 rounded-lg font-medium transition-colors mt-2">
                ยกเลิก / ปิด
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Form ... (คงเดิม) */}
      {modalType === 'form' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6">
            <h2 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2">
              {formData.id ? 'แก้ไขข้อมูลงาน' : 'เพิ่มงานค้างใหม่ (EPT-LV)'}
            </h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Work Order (WO)</label>
                  <input type="text" className="w-full border rounded-lg px-3 py-2" value={formData.wo} onChange={e => setFormData({...formData, wo: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Plan Date</label>
                  {/* แสดงวันที่ใน Form ให้ถูกต้อง */}
                  <input type="date" className="w-full border rounded-lg px-3 py-2" value={formatDate(formData.plan)} onChange={e => setFormData({...formData, plan: e.target.value})} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">ชื่องาน (Description)</label>
                <input type="text" className="w-full border rounded-lg px-3 py-2" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Tag อุปกรณ์</label>
                <input type="text" className="w-full border rounded-lg px-3 py-2" value={formData.equipment} onChange={e => setFormData({...formData, equipment: e.target.value})} />
              </div>
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <label className="block text-sm font-medium mb-1">สาเหตุที่ติด (Blocker)</label>
                <select className="w-full border rounded-lg px-3 py-2 mb-2"
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
                  <input type="text" className="w-full border rounded-lg px-3 py-2 border-orange-300" placeholder="โปรดระบุ..."
                    value={formData.blockerOther} onChange={e => setFormData({...formData, blockerOther: e.target.value})} autoFocus />
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Remark (หมายเหตุเพิ่มเติม)</label>
                <input type="text" className="w-full border rounded-lg px-3 py-2" value={formData.remark} onChange={e => setFormData({...formData, remark: e.target.value})} />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setModalType(null)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">ยกเลิก</button>
              <button onClick={handleSaveTask} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">บันทึกข้อมูล</button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden Export Template (Report A4) */}
      <div ref={reportRef} className="hidden bg-white p-10 mx-auto" style={{ width: '1123px', minHeight: '794px' }}>
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-slate-800 mb-2">EPT-LV Maintenance Backlog Report</h1>
            <p className="text-slate-500">วันที่พิมพ์: {new Date().toLocaleDateString('th-TH')} | แผนก: EPT-LV | สถานที่: Map Ta Phut, Rayong</p>
          </div>
          
          {/* กล่อง KPI ใน Report A4 (โชว์แบบยืดหยุ่นเหมือนหน้าเว็บ) */}
          <div className="flex gap-4 mb-6">
             <div className="flex-1 bg-white p-3 rounded-lg border border-slate-200 border-l-4 border-l-blue-500 text-center">
               <div className="text-slate-500 text-sm mb-1">Pending</div>
               <div className="text-2xl font-bold text-slate-800">{stats.pending}</div>
             </div>
             {activeBlockers.map(b => (
               <div key={b.key} className={`flex-1 bg-white p-3 rounded-lg border border-slate-200 border-l-4 ${b.border} text-center`}>
                  <div className="text-slate-500 text-sm mb-1">{b.label}</div>
                  <div className={`text-2xl font-bold ${b.text}`}>{b.count}</div>
               </div>
             ))}
          </div>

          <table className="w-full text-left mt-4 border-collapse">
            <thead>
              <tr className="bg-slate-100 text-sm text-slate-800">
                <th className="p-3 border border-slate-200 w-24">WO</th>
                <th className="p-3 border border-slate-200">Description / Tag</th>
                <th className="p-3 border border-slate-200 w-28">Plan Date</th>
                <th className="p-3 border border-slate-200 w-24">Status</th>
                <th className="p-3 border border-slate-200 w-40">Blockers</th>
                <th className="p-3 border border-slate-200 w-48">Remark</th>
              </tr>
            </thead>
            <tbody>
              {filteredTasks.slice(0, 15).map(t => (
                <tr key={t.id} className="text-sm">
                  <td className="p-3 border border-slate-200 font-medium">{t.wo}</td>
                  <td className="p-3 border border-slate-200">{t.title} <br/><span className="text-xs text-slate-500">Tag: {t.equipment || '-'}</span></td>
                  {/* ตัดเวลาในรายงานด้วย */}
                  <td className="p-3 border border-slate-200">{formatDate(t.plan)}</td>
                  <td className="p-3 border border-slate-200">{t.status}</td>
                  <td className="p-3 border border-slate-200 text-red-600">{t.blocker || '-'}</td>
                  <td className="p-3 border border-slate-200 text-slate-600">{t.remark || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredTasks.length > 15 && <p className="text-right text-xs text-slate-400 mt-2">* มีรายการงานซ่อนอยู่เนื่องจากล้นหน้ากระดาษ</p>}
      </div>
    </div>
  );
}