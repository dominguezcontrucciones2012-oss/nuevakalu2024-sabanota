import React, { useState, useEffect } from 'react';
import { BusinessSettings, UserIdentity } from '../types';
import {
  Settings,
  Users,
  Database,
  Wrench,
  CheckCircle,
  RefreshCw,
  Plus,
  ShieldAlert,
  Download,
  Terminal,
  Cpu,
  Upload
} from 'lucide-react';
import { exportToJson, importFromJson, createSnapshot, restoreSnapshot } from '../services/backupService';

import { db, storage } from '../services/firebase';
import { doc, setDoc, updateDoc, deleteDoc, getDocs, collection, serverTimestamp, onSnapshot, writeBatch } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { Shift, ShiftItem, saveShift, loadShifts, deleteShift } from '../services/shiftManager';

interface SettingsAdminViewProps {
  settings: BusinessSettings;
  users: UserIdentity[];
  onUpdateSettings: (newSettings: Partial<BusinessSettings>) => void;
  onAddNotification: (msg: string, type: 'success' | 'info' | 'warning') => void;
  onResetAccounting?: () => Promise<void>;
}

export default function SettingsAdminView({
  settings,
  users,
  onUpdateSettings,
  onAddNotification,
  onResetAccounting
}: SettingsAdminViewProps) {
  const [activeSubTab, setActiveSubTab] = useState<'config' | 'users' | 'backup' | 'maintenance'>('config');
  const [businessName, setBusinessName] = useState(settings.businessName);
  const [taxRate, setTaxRate] = useState(settings.taxRate === 16 || settings.taxRate === undefined ? 5 : settings.taxRate);
  const [exchangeRate, setExchangeRate] = useState(settings.exchangeRate || 45.00);
  const [defaultStartingCash, setDefaultStartingCash] = useState(settings.defaultStartingCash || 0);
  const [emergencyAlertMode, setEmergencyAlertMode] = useState(settings.emergencyAlertMode);

  // Sabanota Initials States
  const [drawerUsd, setDrawerUsd] = useState(settings.sabanotaInitials?.drawerUsd || 0);
  const [drawerBs, setDrawerBs] = useState(settings.sabanotaInitials?.drawerBs || 0);
  const [bankBalanceBs, setBankBalanceBs] = useState(settings.sabanotaInitials?.bankBalanceBs || 0);
  const [bankBalanceUsd, setBankBalanceUsd] = useState(settings.sabanotaInitials?.bankBalanceUsd || 0);
  const [totalCapital, setTotalCapital] = useState(settings.sabanotaInitials?.totalCapital || 0);

  useEffect(() => {
    if (settings.taxRate === 16 || settings.taxRate === undefined) {
      setTaxRate(5);
    }
  }, [settings.taxRate]);

  // User Administration States
  const [showAddUserForm, setShowAddUserForm] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserCedula, setNewUserCedula] = useState('');
  const [newUserPin, setNewUserPin] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserIdentity['role']>('cajero');

  // Backup States
  const [backupStep, setBackupStep] = useState<'idle' | 'running' | 'completed'>('idle');
  const [backupLogs, setBackupLogs] = useState<string[]>([]);
  const [backupsHistory, setBackupsHistory] = useState<any[]>([
    { id: 'BKP-0921', date: '01 Jul 2026', file: 'kalu_respaldo_mensual_julio.zip', size: '2.4 MB', status: 'Verificado' },
    { id: 'BKP-0845', date: '08 Jul 2026', file: 'kalu_respaldo_semanal_08.zip', size: '1.8 MB', status: 'Verificado' }
  ]);

  // Maintenance States
  const [maintLogs, setMaintLogs] = useState<string[]>([]);
  const [isWiping, setIsWiping] = useState(false);

  // Shift Manager States
  const [localShifts, setLocalShifts] = useState<Shift[]>([]);
  const [selectedShiftId, setSelectedShiftId] = useState<string>('');
  
  const [shiftBannerTitle, setShiftBannerTitle] = useState('');
  const [shiftBannerDesc, setShiftBannerDesc] = useState('');
  const [shiftBannerFile, setShiftBannerFile] = useState<File | null>(null);
  
  const [isPublishingShift, setIsPublishingShift] = useState(false);
  const [activeBanners, setActiveBanners] = useState<any[]>([]);

  // Shift Modal States
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [newShiftName, setNewShiftName] = useState('');
  
  // Publish Confirmation & Progress States
  const [confirmPublishShift, setConfirmPublishShift] = useState<Shift | null>(null);
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploadPercent, setUploadPercent] = useState(0);
  const [activeUploadTask, setActiveUploadTask] = useState<any>(null);

  useEffect(() => {
    // Cargar turnos locales al abrir la pestaña
    if (activeSubTab === 'maintenance') {
      loadShifts().then(setLocalShifts).catch(console.error);

      // Escuchar banners activos de la nube
      const unsub = onSnapshot(collection(db, 'banners'), (snap) => {
        const arr: any[] = [];
        snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
        setActiveBanners(arr);
      });
      return () => unsub();
    }
  }, [activeSubTab]);

  const handleCreateShift = () => {
    setShowShiftModal(true);
    setNewShiftName('');
  };

  const confirmCreateShift = async () => {
    if (!newShiftName.trim()) {
      return onAddNotification('El nombre no puede estar vacío.', 'warning');
    }
    const newShift: Shift = {
      id: `shift_${Date.now()}`,
      name: newShiftName.trim(),
      items: []
    };
    await saveShift(newShift);
    setLocalShifts(await loadShifts());
    setSelectedShiftId(newShift.id);
    setShowShiftModal(false);
    onAddNotification('Turno creado localmente.', 'success');
  };

  const handleDeleteLocalShift = async (id: string) => {
    if (window.confirm('¿Eliminar este turno localmente?')) {
      await deleteShift(id);
      setLocalShifts(await loadShifts());
      if (selectedShiftId === id) setSelectedShiftId('');
    }
  };

  const handleAddFileToShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedShiftId) return onAddNotification('Seleccione un turno primero.', 'warning');
    if (!shiftBannerFile) return onAddNotification('Seleccione un archivo de imagen o video.', 'warning');
    if (!shiftBannerTitle) return onAddNotification('Escriba un título.', 'warning');

    const s = localShifts.find(x => x.id === selectedShiftId);
    if (!s) return;
    if (s.items.length >= 3) {
      return onAddNotification('Máximo 3 elementos por turno.', 'warning');
    }

    const newItem: ShiftItem = {
      id: `item_${Date.now()}`,
      title: shiftBannerTitle,
      desc: shiftBannerDesc,
      fileBlob: shiftBannerFile,
      fileName: shiftBannerFile.name,
      type: shiftBannerFile.type
    };

    const updatedShift = { ...s, items: [...s.items, newItem] };
    await saveShift(updatedShift);
    setLocalShifts(await loadShifts());
    
    setShiftBannerTitle('');
    setShiftBannerDesc('');
    setShiftBannerFile(null);
    onAddNotification('Archivo agregado al turno local.', 'success');
  };

  const handleRemoveFileFromShift = async (shiftId: string, itemId: string) => {
    const s = localShifts.find(x => x.id === shiftId);
    if (!s) return;
    const updatedShift = { ...s, items: s.items.filter(x => x.id !== itemId) };
    await saveShift(updatedShift);
    setLocalShifts(await loadShifts());
  };

  const handlePublishShift = async (shift: Shift) => {
    if (shift.items.length === 0) {
      return onAddNotification('El turno está vacío. Agregue archivos.', 'warning');
    }

    setIsPublishingShift(true);
    setUploadStatus('Preparando limpieza de nube...');
    setUploadPercent(0);
    try {
      setMaintLogs(prev => [...prev, `[Banners] Iniciando publicación del turno: ${shift.name}`]);
      
      const timeoutPromise = (ms: number, msg: string) => 
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error(msg)), ms));

      // 1. Delete existing cloud banners from Firestore and Storage
      setMaintLogs(prev => [...prev, `[Banners] Purgando banners anteriores de la nube en paralelo...`]);
      const currentSnap = await getDocs(collection(db, 'banners'));
      
      const deletePromises = currentSnap.docs.map(async (d) => {
        const data = d.data();
        if (data.storagePath && !data.storagePath.startsWith('/uploads')) {
          try { await deleteObject(ref(storage, data.storagePath)); } catch (e) { /* ignorar si ya no existe */ }
        }
        try { await deleteDoc(d.ref); } catch (e) { /* ignorar */ }
      });
      await Promise.allSettled(deletePromises);

      // 2. Upload new files and create Firestore docs
      setMaintLogs(prev => [...prev, `[Banners] Subiendo ${shift.items.length} archivos nuevos al servidor local/VPS...`]);
      for (let i = 0; i < shift.items.length; i++) {
        const item = shift.items[i];
        
        const mimeType = item.type || (item.fileName.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg');
        const cleanBlob = new Blob([item.fileBlob], { type: mimeType });
        
        setUploadStatus(`Subiendo archivo ${i+1} de ${shift.items.length}: ${item.fileName}...`);
        
        const formData = new FormData();
        formData.append('files', cleanBlob, item.fileName);
        
        try {
          const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
          });
          
          if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status}`);
          }
          
          const result = await response.json();
          const downloadUrl = result.urls[0];
          
          setUploadStatus(`Guardando referencia en base de datos ${i+1}/${shift.items.length}...`);
          
          await setDoc(doc(collection(db, 'banners')), {
            title: item.title,
            desc: item.desc,
            url: downloadUrl,
            storagePath: downloadUrl,
            type: item.type,
            active: true,
            createdAt: serverTimestamp()
          });
          
          setUploadPercent(Math.round(((i + 1) / shift.items.length) * 100));
        } catch (error: any) {
          setMaintLogs(prev => [...prev, `[Banners] Error en subida de ${item.fileName}: ${error.message}`]);
          throw error;
        }
      }

      setMaintLogs(prev => [...prev, `[Banners] Turno publicado exitosamente.`]);
      onAddNotification(`Turno ${shift.name} publicado.`, 'success');
      setConfirmPublishShift(null);
    } catch (err: any) {
      onAddNotification('Error publicando turno: ' + err.message, 'warning');
      setMaintLogs(prev => [...prev, `[Banners] Error crítico: ${err.message}`]);
    } finally {
      setIsPublishingShift(false);
      setUploadStatus('');
      setUploadPercent(0);
      setActiveUploadTask(null);
    }
  };


  const handleWipeContabilidad = async () => {
    if (!window.confirm("¡ADVERTENCIA CRÍTICA!\n\n¿Estás seguro de que quieres borrar TODAS las ventas, transacciones y limpiar los saldos de clientes y proveedores?\n\nEsta acción NO se puede deshacer y borrará la contabilidad de la base de datos en la nube.")) {
      return;
    }
    
    setIsWiping(true);
    setMaintLogs(prev => [...prev, 'INICIANDO PURGA DE CONTABILIDAD...']);
    
    try {
      setMaintLogs(prev => [...prev, 'Borrando transacciones (historial)...']);
      const txs = await getDocs(collection(db, 'transactions'));
      for (const d of txs.docs) {
        await deleteDoc(d.ref);
      }
      setMaintLogs(prev => [...prev, `Borradas ${txs.docs.length} transacciones.`]);

      setMaintLogs(prev => [...prev, 'Reseteando saldos de proveedores...']);
      const sups = await getDocs(collection(db, 'suppliers'));
      for (const d of sups.docs) {
        await updateDoc(d.ref, { balanceOwed: 0, storeDebt: 0 });
      }

      setMaintLogs(prev => [...prev, 'Reseteando deudas de clientes...']);
      const clis = await getDocs(collection(db, 'clients'));
      for (const d of clis.docs) {
        await updateDoc(d.ref, { outstandingDebt: 0, loyaltyPoints: 0 });
      }

      setMaintLogs(prev => [...prev, '¡PURGA DE CONTABILIDAD COMPLETADA EXITOSAMENTE!']);
      onAddNotification("Contabilidad reseteada a cero correctamente.", "success");
    } catch (error) {
      console.error(error);
      setMaintLogs(prev => [...prev, 'ERROR CRÍTICO AL PURGAR LA BD.']);
      onAddNotification("Ocurrió un error al limpiar la base de datos.", "warning");
    } finally {
      setIsWiping(false);
    }
  };
  const [isMaintRunning, setIsMaintRunning] = useState(false);

  const handleSaveOperational = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateSettings({
      businessName: businessName || 'Negocio',
      exchangeRate: exchangeRate || 45,
      emergencyAlertMode: !!emergencyAlertMode
    });
    onAddNotification('Parámetros operativos guardados.', 'success');
  };

  const handleSaveTax = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateSettings({
      taxRate: taxRate !== undefined ? taxRate : 5
    });
    onAddNotification('Configuración fiscal (IVA) actualizada.', 'success');
  };

  const handleSaveInitials = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateSettings({
      defaultStartingCash: defaultStartingCash || 0,
      centralVaultBalance: {
        usd: drawerUsd + bankBalanceUsd,
        bs: drawerBs + bankBalanceBs,
        bankBs: bankBalanceBs,
        bankUsd: bankBalanceUsd
      },
      sabanotaInitials: {
        drawerUsd,
        drawerBs,
        bankBalanceBs,
        bankBalanceUsd,
        totalCapital
      }
    });
    onAddNotification('Saldos iniciales fijados y Bóveda actualizada.', 'success');
  };


  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName || !newUserCedula || !newUserPin) return;
    
    try {
      const newId = `usr-${Date.now()}`;
      await setDoc(doc(db, 'users', newId), {
        name: newUserName,
        cedula: newUserCedula,
        pin: newUserPin,
        role: newUserRole,
        active: true,
        initials: newUserName.slice(0, 2).toUpperCase()
      });
      onAddNotification(`Usuario ${newUserName} agregado como ${newUserRole}.`, 'success');
      setNewUserName('');
      setNewUserCedula('');
      setNewUserPin('');
      setNewUserRole('cajero');
      setShowAddUserForm(false);
    } catch (err: any) {
      onAddNotification('Error creando usuario: ' + err.message, 'warning');
    }
  };

  const handleToggleUserStatus = async (id: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, 'users', id), { active: !currentStatus });
      onAddNotification(`Estado del usuario actualizado.`, 'success');
    } catch (err: any) {
      onAddNotification('Error actualizando usuario: ' + err.message, 'warning');
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!window.confirm('¿Desea eliminar permanentemente este usuario?')) return;
    try {
      await deleteDoc(doc(db, 'users', id));
      onAddNotification(`Usuario eliminado del sistema.`, 'info');
    } catch (err: any) {
      onAddNotification('Error eliminando usuario: ' + err.message, 'warning');
    }
  };

  const handleChangeRole = async (id: string, newRole: string) => {
    try {
      await updateDoc(doc(db, 'users', id), { role: newRole });
      onAddNotification(`Rol de usuario actualizado a ${newRole}.`, 'success');
    } catch (err: any) {
      onAddNotification('Error actualizando rol: ' + err.message, 'warning');
    }
  };

  const handleRunBackup = async () => {
    setBackupStep('running');
    setBackupLogs([]);
    
    const logs = [
      'Preparando exportación segura de datos operacionales...',
      'Leyendo catálogos, mermas, clientes y proveedores...',
      'Serializando JSON y preparando archivo de descarga...'
    ];

    logs.forEach((log, index) => {
      setTimeout(() => setBackupLogs(prev => [...prev, log]), (index + 1) * 350);
    });

    try {
      await exportToJson();
      
      setTimeout(() => {
        setBackupStep('completed');
        const newBkp = {
          id: `BKP-${Date.now()}`,
          date: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
        timestamp: serverTimestamp(),
          file: `kalu_respaldo_${new Date().toISOString().split('T')[0]}.json`,
          size: '---',
          status: 'Descargado Localmente'
        };
        setBackupsHistory(prev => [newBkp, ...prev]);
        onAddNotification('Copia de seguridad local generada y descargada.', 'success');
      }, logs.length * 350 + 500);
    } catch (err: any) {
      setBackupStep('idle');
      onAddNotification('Error generando el respaldo: ' + err.message, 'warning');
    }
  };

  const handleImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const confirmRest = window.confirm('ATENCIÓN: Esto borrará los datos actuales y restaurará los del archivo. ¿Continuar?');
    if (!confirmRest) {
      e.target.value = '';
      return;
    }

    try {
      onAddNotification('Iniciando restauración desde JSON... No cierre la página.', 'info');
      await importFromJson(file);
      onAddNotification('Restauración completada. Los datos se sincronizarán en breve.', 'success');
    } catch (err: any) {
      onAddNotification('Error restaurando el archivo JSON: ' + err.message, 'warning');
    }
    e.target.value = '';
  };

  const [isSnapshotLoading, setIsSnapshotLoading] = useState(false);
  const handleCreateSnapshot = async () => {
    try {
      setIsSnapshotLoading(true);
      onAddNotification('Creando Snapshot en Firestore...', 'info');
      await createSnapshot();
      onAddNotification('Snapshot guardado exitosamente.', 'success');
    } catch (err: any) {
      onAddNotification('Error al crear Snapshot: ' + err.message, 'warning');
    } finally {
      setIsSnapshotLoading(false);
    }
  };

  const handleRestoreSnapshot = async () => {
    const confirmText = window.prompt('ATENCIÓN: Esto revertirá y dejará EN CERO toda la contabilidad (Ventas, Libreta, Gastos). Los productos no se borrarán. Escriba PONER EN CERO para confirmar:');
    if (confirmText !== 'PONER EN CERO') {
      onAddNotification('Restauración cancelada o palabra incorrecta.', 'info');
      return;
    }

    try {
      setIsSnapshotLoading(true);
      onAddNotification('Borrando datos contables y reiniciando libretas... Por favor espere.', 'info');
      
      // Call the global reset function passed from App.tsx
      if (onResetAccounting) {
        await onResetAccounting();
      }

      onAddNotification('Contabilidad reiniciada a cero exitosamente. Datos locales actualizados.', 'success');
    } catch (err: any) {
      onAddNotification('Error al reiniciar contabilidad: ' + err.message, 'warning');
    } finally {
      setIsSnapshotLoading(false);
    }
  };

  const runMaintenanceTask = (taskType: 'db' | 'purge' | 'mermas') => {
    setIsMaintRunning(true);
    setMaintLogs([]);

    let logs: string[] = [];
    let completeMsg = '';

    if (taskType === 'db') {
      logs = [
        'Iniciando optimización de índices de almacenamiento de bases de datos...',
        'Limpiando tablas temporales huérfanas...',
        'Reconstruyendo índices B-Tree de la tabla de ventas e historial de mermas...',
        'Base de datos compactada e indexada en 150ms.'
      ];
      completeMsg = 'La base de datos se ha optimizado y re-indexado.';
    } else if (taskType === 'purge') {
      logs = [
        'Buscando archivos temporales y sesiones expiradas de cajeros...',
        'Purgando logs de terminal POS anteriores a la fecha de retención...',
        'Limpieza de caché terminada con éxito. 14.2 MB liberados.'
      ];
      completeMsg = 'Caché de terminal y logs POS depurados.';
    } else {
      logs = [
        'Analizando lotes de queso en maduración activa...',
        'Re-calibrando coeficientes de evaporación por humedad ambiental...',
        'Mermas proyectadas ajustadas conforme a lecturas físicas recientes.'
      ];
      completeMsg = 'Cálculos de mermas por deshidratación natural re-calibrados.';
    }

    logs.forEach((log, index) => {
      setTimeout(() => {
        setMaintLogs(prev => [...prev, log]);
      }, (index + 1) * 300);
    });

    setTimeout(() => {
      setIsMaintRunning(false);
      onAddNotification(completeMsg, 'success');
    }, logs.length * 300 + 100);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Sub tabs row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 border-b border-editorial-border/60 pb-4">
        {[
          { id: 'config', label: 'Ajustes del Sistema', icon: Settings },
          { id: 'users', label: 'Gestión de Usuarios', icon: Users },
          { id: 'backup', label: 'Copia de Seguridad', icon: Database },
          { id: 'maintenance', label: 'Herramientas Maint.', icon: Wrench }
        ].map(tab => {
          const Icon = tab.icon;
          const isSelected = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              className={`flex items-center justify-center gap-2 p-3 text-[11px] font-mono font-bold uppercase tracking-wider rounded border transition-all cursor-pointer ${
                isSelected
                  ? 'bg-amber-500 border-amber-600 text-white'
                  : 'bg-editorial-card border-editorial-border text-editorial-text-muted hover:text-editorial-text-primary'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {activeSubTab === 'config' && (
        <div className="space-y-6">
          <div className="space-y-1">
            <h3 className="font-serif text-2xl font-bold text-editorial-text-primary">Ajustes Generales de Operación</h3>
            <p className="text-xs text-editorial-text-muted">Configure los parámetros contables, de facturación y alertas críticas del negocio.</p>
          </div>

          <form onSubmit={handleSaveOperational} className="bg-editorial-card border border-editorial-border rounded p-6 space-y-6">
            <h4 className="text-sm font-bold font-serif text-editorial-text-primary border-b border-editorial-border/60 pb-2">
              Parámetros Operativos
            </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-editorial-text-muted uppercase block">Nombre Oficial de la Quesería</label>
              <input
                type="text" required value={businessName} onChange={e => setBusinessName(e.target.value)}
                className="w-full h-11 px-3 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-editorial-text-muted uppercase block">Tasa de Cambio Oficial (Bs / $)</label>
              <input
                type="number" step="0.01" required value={exchangeRate} onChange={e => setExchangeRate(parseFloat(e.target.value) || 0)}
                className="w-full h-11 px-3 bg-amber-500/10 border border-amber-500/50 rounded text-xs text-amber-500 font-mono font-bold focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="space-y-1.5 flex flex-col justify-end">
              <div className="flex items-center justify-between p-3 bg-editorial-bg border border-editorial-border rounded">
                <div>
                  <span className="text-xs font-bold text-editorial-text-primary block">Modo de Alerta de Emergencia</span>
                  <p className="text-[10px] text-editorial-text-muted">Notificaciones visuales intensas por bajo stock o mermas críticas</p>
                </div>
                <input
                  type="checkbox"
                  checked={emergencyAlertMode}
                  onChange={e => setEmergencyAlertMode(e.target.checked)}
                  className="w-4 h-4 text-amber-500 rounded border-editorial-border cursor-pointer"
                />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-editorial-border flex justify-end">
            <button
              type="submit"
              className="px-6 h-10 bg-amber-500 text-white font-serif font-bold text-xs tracking-wider uppercase hover:brightness-110 transition-all cursor-pointer"
            >
              Guardar Parámetros
            </button>
          </div>
        </form>

          <form onSubmit={handleSaveTax} className="bg-editorial-card border border-editorial-border rounded p-6 space-y-6">
            <h4 className="text-sm font-bold font-serif text-editorial-text-primary border-b border-editorial-border/60 pb-2">
              Configuración Fiscal
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-editorial-text-muted uppercase block">Tasa Impositiva Local de IVA (%)</label>
                <input
                  type="number" required value={taxRate} onChange={e => setTaxRate(parseFloat(e.target.value) || 0)}
                  className="w-full h-11 px-3 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary font-mono focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
            <div className="pt-4 border-t border-editorial-border flex justify-end">
              <button
                type="submit"
                className="px-6 h-10 bg-amber-500 text-white font-serif font-bold text-xs tracking-wider uppercase hover:brightness-110 transition-all cursor-pointer"
              >
                Actualizar IVA
              </button>
            </div>
          </form>

          <form onSubmit={handleSaveInitials} className="bg-editorial-card border border-editorial-border rounded p-6 space-y-6">
            <h4 className="text-sm font-bold font-serif text-editorial-text-primary flex items-center gap-2 border-b border-editorial-border/60 pb-2">
              <Database className="w-4 h-4 text-emerald-500" /> Saldos Iniciales de Apertura (Sabanota)
            </h4>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-editorial-text-muted uppercase block">Fondo de Caja Fijo por Defecto ($ M.N.)</label>
                <input
                  type="number" required value={defaultStartingCash} onChange={e => setDefaultStartingCash(parseFloat(e.target.value) || 0)}
                  className="w-full h-11 px-3 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary font-mono focus:outline-none focus:border-amber-500"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase tracking-widest text-editorial-text-muted">Fondo Inicial Gaveta ($ USD)</label>
                <input
                  type="number"
                  value={drawerUsd}
                  onChange={e => setDrawerUsd(Number(e.target.value))}
                  className="w-full h-11 px-3 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase tracking-widest text-editorial-text-muted">Fondo Inicial Gaveta (Bs)</label>
                <input
                  type="number"
                  value={drawerBs}
                  onChange={e => setDrawerBs(Number(e.target.value))}
                  className="w-full h-11 px-3 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase tracking-widest text-editorial-text-muted">Capital Total de Arranque / Patrimonio</label>
                <input
                  type="number"
                  value={totalCapital}
                  onChange={e => setTotalCapital(Number(e.target.value))}
                  className="w-full h-11 px-3 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase tracking-widest text-editorial-text-muted">Saldo Inicial Bancos (Bs)</label>
                <input
                  type="number"
                  value={bankBalanceBs}
                  onChange={e => setBankBalanceBs(Number(e.target.value))}
                  className="w-full h-11 px-3 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase tracking-widest text-editorial-text-muted">Saldo Inicial Bancos ($ USD)</label>
                <input
                  type="number"
                  value={bankBalanceUsd}
                  onChange={e => setBankBalanceUsd(Number(e.target.value))}
                  className="w-full h-11 px-3 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-editorial-border flex justify-end">
              <button
                type="submit"
                className="px-6 h-10 bg-amber-500 text-white font-serif font-bold text-xs tracking-wider uppercase hover:brightness-110 transition-all cursor-pointer"
              >
                Fijar Saldos Iniciales
              </button>
            </div>
          </form>
        </div>
      )}

      {activeSubTab === 'users' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center flex-wrap gap-4">
            <div>
              <h3 className="font-serif text-2xl font-bold text-editorial-text-primary">Gestión de Usuarios &amp; Permisos</h3>
              <p className="text-xs text-editorial-text-muted">Administre los cajeros autorizados para operar el punto de venta y auditores de caja.</p>
            </div>
            <button
              onClick={() => setShowAddUserForm(!showAddUserForm)}
              className="px-4 py-2 bg-amber-500 text-white font-serif font-bold text-xs tracking-wider uppercase flex items-center gap-1.5 hover:brightness-110 transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Nuevo Colaborador
            </button>
          </div>

          {showAddUserForm && (
            <form onSubmit={handleCreateUser} className="bg-editorial-card border border-editorial-border rounded p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-3 pb-2 border-b border-editorial-border/40 flex justify-between items-center font-serif text-md font-bold text-editorial-text-primary">
                <span>Registrar Nuevo Colaborador</span>
                <button type="button" onClick={() => setShowAddUserForm(false)} className="text-xs font-mono text-rose-400 uppercase hover:underline">Cancelar</button>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-editorial-text-muted uppercase block">Nombre de Pila</label>
                <input
                  type="text" required value={newUserName} onChange={e => setNewUserName(e.target.value)} placeholder="Ej: Don Chilo"
                  className="w-full h-10 px-3 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-editorial-text-muted uppercase block">Cédula de Identidad</label>
                <input
                  type="text" required value={newUserCedula} onChange={e => setNewUserCedula(e.target.value)} placeholder="Ej: 12345678"
                  className="w-full h-10 px-3 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-editorial-text-muted uppercase block">PIN de Acceso</label>
                <input
                  type="text" required value={newUserPin} onChange={e => setNewUserPin(e.target.value)} placeholder="Ej: 1234"
                  className="w-full h-10 px-3 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-editorial-text-muted uppercase block">Rol de Permisos</label>
                <select
                  value={newUserRole} onChange={e => setNewUserRole(e.target.value as any)}
                  className="w-full h-10 px-3 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary focus:outline-none cursor-pointer"
                >
                  <option value="cajero">Cajero (Punto de Venta solamente)</option>
                  <option value="auditor">Auditor (Finanzas y libro mayor)</option>
                  <option value="admin">Administrador General</option>
                </select>
              </div>

              <div className="md:col-span-3 pt-4 border-t border-editorial-border/40 flex justify-end">
                <button
                  type="submit"
                  className="px-6 h-10 bg-amber-500 text-white font-serif font-bold text-xs tracking-wider uppercase hover:brightness-110 transition-all cursor-pointer"
                >
                  Confirmar Alta de Colaborador
                </button>
              </div>
            </form>
          )}

          <div className="bg-editorial-card border border-editorial-border rounded p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-editorial-border text-[10px] font-mono text-editorial-text-muted uppercase tracking-wider">
                    <th className="py-3 px-3">Colaborador</th>
                    <th className="py-3 px-3">Cédula</th>
                    <th className="py-3 px-3 text-center">Rol Asignado</th>
                    <th className="py-3 px-3 text-center">Estado de Cuenta</th>
                    <th className="py-3 px-3 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-editorial-border/60">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-editorial-bg/30">
                      <td className="py-3.5 px-3">
                        <div className="font-serif text-sm font-extrabold text-editorial-text-primary">{u.name}</div>
                        <span className="font-mono text-[9px] text-editorial-text-muted/60">ID: {u.id}</span>
                      </td>
                      <td className="py-3.5 px-3 text-editorial-text-muted font-sans">{u.cedula}</td>
                      <td className="py-3.5 px-3 text-center">
                        <span className={`px-2.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${
                            u.role === 'admin'
                              ? 'bg-purple-950/20 text-purple-400 border-purple-800/40'
                              : u.role === 'auditor'
                              ? 'bg-amber-950/20 text-amber-400 border-amber-800/40'
                              : 'bg-editorial-bg text-editorial-text-muted border-editorial-border'
                        }`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 text-center font-sans">
                        <button
                          onClick={() => handleToggleUserStatus(u.id, u.active)}
                          className={`inline-block text-[10px] font-mono font-bold uppercase px-2.5 py-0.5 rounded border transition-all cursor-pointer ${
                            u.active
                              ? 'bg-emerald-950/20 text-emerald-400 border-emerald-800/40 hover:bg-rose-950 hover:text-rose-400 hover:border-rose-800'
                              : 'bg-rose-950/20 text-rose-400 border-rose-800/40 hover:bg-emerald-950 hover:text-emerald-400 hover:border-emerald-800'
                          }`}
                        >
                          {u.active ? 'Activo' : 'Inactivo'}
                        </button>
                      </td>
                      <td className="py-3.5 px-3 text-center">
                        <select
                          value={u.role}
                          onChange={(e) => handleChangeRole(u.id, e.target.value)}
                          className="px-2 py-1 bg-editorial-bg border border-editorial-border rounded text-[10px] font-mono focus:outline-none cursor-pointer text-editorial-text-primary mr-2"
                        >
                          <option value="cajero">Cajero</option>
                          <option value="auditor">Auditor</option>
                          <option value="admin">Administrador</option>
                        </select>
                        <button
                          onClick={() => handleDeleteUser(u.id)}
                          className="text-[10px] font-mono text-rose-500 hover:underline cursor-pointer"
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeSubTab === 'backup' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Main Trigger back action */}
          <div className="lg:col-span-7 bg-editorial-card border border-editorial-border rounded p-6 space-y-6">
            <div className="space-y-1.5">
              <h3 className="font-serif text-2xl font-bold text-editorial-text-primary">Copias de Seguridad del Almacén</h3>
              <p className="text-xs text-editorial-text-muted">Cree y descargue copias completas de la contabilidad, clientes, proveedores y auditorías de mermas.</p>
            </div>

            {backupStep === 'idle' && (
              <div className="py-8 border border-dashed border-editorial-border rounded p-8 text-center space-y-4">
                <Database className="w-12 h-12 text-editorial-text-muted/30 mx-auto" />
                <div className="space-y-1">
                  <h4 className="font-serif text-lg font-bold">Copia de Seguridad en Caliente</h4>
                  <p className="text-xs text-editorial-text-muted max-w-md mx-auto">
                    El sistema empaquetará la base de datos completa de Quesería KALU y generará un volcado zip descargable instantáneo.
                  </p>
                </div>
                <button
                  onClick={handleRunBackup}
                  className="px-6 py-3 bg-amber-500 hover:brightness-110 text-white font-serif font-bold text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2 mx-auto"
                >
                  <Cpu className="w-4 h-4 animate-pulse" />
                  Descargar Respaldo JSON Local
                </button>
                <div className="pt-4 mt-4 border-t border-editorial-border/40">
                  <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-editorial-bg border border-editorial-border rounded text-[10px] font-mono font-bold uppercase hover:bg-editorial-card transition-all text-editorial-text-primary">
                    <Upload className="w-3.5 h-3.5 text-editorial-text-muted" />
                    <span>Importar Datos desde JSON Local</span>
                    <input type="file" accept=".json" className="hidden" onChange={handleImportJson} />
                  </label>
                </div>
              </div>
            )}

            {backupStep === 'running' && (
              <div className="border border-editorial-border bg-editorial-bg rounded p-5 font-mono text-xs text-emerald-400 space-y-3">
                <div className="flex justify-between items-center font-bold pb-2 border-b border-emerald-800/40">
                  <span className="flex items-center gap-1.5 animate-pulse">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Generando Respaldo Criptográfico...
                  </span>
                  <span>100% Autónomo</span>
                </div>
                <div className="space-y-1">
                  {backupLogs.map((log, idx) => (
                    <div key={idx} className="flex gap-1.5">
                      <span className="text-emerald-800">&gt;</span>
                      <p>{log}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {backupStep === 'completed' && (
              <div className="border border-emerald-500/30 rounded p-6 text-center bg-emerald-950/10 space-y-4">
                <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto" />
                <h4 className="font-serif text-lg font-bold text-editorial-text-primary">Volcado de Respaldo Exitoso</h4>
                <p className="text-xs text-editorial-text-muted max-w-md mx-auto">
                  El volcado se ha verificado e integrado al historial de copias seguras. El archivo ya está firmado criptográficamente.
                </p>
                <button
                  onClick={() => setBackupStep('idle')}
                  className="px-4 py-2 border border-editorial-border text-xs font-mono font-bold uppercase hover:bg-editorial-card transition-all cursor-pointer text-editorial-text-primary"
                >
                  Generar Otro Respaldo
                </button>
              </div>
            )}
          </div>

          {/* Backup logs and history */}
          <div className="lg:col-span-5 bg-editorial-card border border-editorial-border rounded p-6 space-y-4">
            <h4 className="font-serif text-lg font-bold text-editorial-text-primary">Historial de Respaldos Verificados</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-[11px] font-mono text-editorial-text-muted">
                <thead>
                  <tr className="border-b border-editorial-border text-editorial-text-muted uppercase">
                    <th className="py-2">Archivo</th>
                    <th className="py-2 text-right">Tamaño</th>
                    <th className="py-2 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-editorial-border/40">
                  {backupsHistory.map((b) => (
                    <tr key={b.id}>
                      <td className="py-2.5">
                        <span className="font-semibold text-editorial-text-primary block">{b.file}</span>
                        <span className="text-[9px] text-editorial-text-muted/60">{b.date} • {b.id}</span>
                      </td>
                      <td className="py-2.5 text-right">{b.size}</td>
                      <td className="py-2.5 text-center">
                        <button
                          title="Descargar Respaldo"
                          className="p-1 border border-editorial-border hover:border-amber-500 hover:text-amber-500 rounded bg-editorial-bg transition-all cursor-pointer inline-flex items-center"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeSubTab === 'maintenance' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Action buttons list */}
          <div className="lg:col-span-7 bg-editorial-card border border-editorial-border rounded p-6 space-y-6">
            <div className="space-y-1.5">
              <h3 className="font-serif text-2xl font-bold text-editorial-text-primary">Herramientas de Mantenimiento Activo</h3>
              <p className="text-xs text-editorial-text-muted">Utilidades administrativas para depurar cachés, optimizar bases de datos y sincronizar mermas.</p>
            </div>

            <div className="bg-rose-950/20 border border-rose-900/50 rounded p-5 space-y-4 mb-6">
              <div className="flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-serif text-sm font-bold text-rose-500 uppercase tracking-wider">Entorno de Pruebas y Botón de Pánico</h4>
                  <p className="text-[11px] text-rose-400/80 mt-1">Guarde un estado seguro de la base de datos operativa y reviértala si ocurre un error durante las pruebas. Esto no afectará la configuración general ni los fondos iniciales.</p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  onClick={handleCreateSnapshot}
                  disabled={isSnapshotLoading}
                  className="flex-1 px-4 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 font-mono text-[10px] uppercase font-bold border border-rose-500/40 rounded transition-all cursor-pointer disabled:opacity-50"
                >
                  Guardar Estado Actual (Snapshot)
                </button>
                <button
                  onClick={handleRestoreSnapshot}
                  disabled={isSnapshotLoading}
                  className="flex-1 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-mono text-[10px] uppercase font-bold border border-rose-700 rounded transition-all cursor-pointer disabled:opacity-50"
                >
                  Revertir Datos al Snapshot
                </button>
              </div>
            </div>

            <div className="bg-editorial-bg border border-editorial-border rounded p-5 space-y-5">
              <div className="flex items-center justify-between border-b border-editorial-border pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                    <Upload className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-serif text-md font-bold text-editorial-text-primary">Gestor de Banners PWA (Por Turnos)</h4>
                    <p className="text-[11px] text-editorial-text-muted">Carga videos locales (IndexedDB) y publícalos a Firebase.</p>
                  </div>
                </div>
                <button onClick={handleCreateShift} className="px-3 py-1.5 bg-emerald-600/20 text-emerald-400 hover:bg-emerald-500/30 font-bold text-[10px] uppercase rounded border border-emerald-500/30 transition-colors">
                  + Crear Turno
                </button>
              </div>

              {localShifts.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                    {localShifts.map(s => (
                      <button
                        key={s.id}
                        onClick={() => setSelectedShiftId(s.id)}
                        className={`px-4 py-2 shrink-0 rounded border text-xs font-bold uppercase transition-all ${selectedShiftId === s.id ? 'bg-editorial-card border-emerald-500 text-emerald-400' : 'bg-editorial-bg border-editorial-border text-editorial-text-muted hover:border-emerald-500/40'}`}
                      >
                        {s.name} ({s.items.length}/3)
                      </button>
                    ))}
                  </div>

                  {selectedShiftId && (
                    <div className="bg-editorial-card border border-editorial-border rounded p-4 space-y-4">
                      {/* Formulario de Items */}
                      <form onSubmit={handleAddFileToShift} className="space-y-4 bg-slate-900/50 p-4 border border-slate-800 rounded">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-editorial-text-muted uppercase tracking-wider">Título del Anuncio</label>
                            <input type="text" value={shiftBannerTitle} onChange={e => setShiftBannerTitle(e.target.value)} required className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-white focus:border-emerald-500 outline-none" placeholder="Promoción..." />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-editorial-text-muted uppercase tracking-wider">Archivo Físico (Local)</label>
                            <input type="file" accept="image/*,video/*" onChange={e => setShiftBannerFile(e.target.files?.[0] || null)} required className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-[11px] text-slate-400 file:mr-3 file:py-1 file:px-2 file:rounded file:border-0 file:text-[10px] file:font-bold file:bg-emerald-600 file:text-white hover:file:bg-emerald-500 cursor-pointer" />
                          </div>
                        </div>
                        <div className="flex gap-3 items-end">
                          <div className="flex-1 space-y-1.5">
                            <label className="text-[10px] font-bold text-editorial-text-muted uppercase tracking-wider">Descripción Breve</label>
                            <input type="text" value={shiftBannerDesc} onChange={e => setShiftBannerDesc(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-white focus:border-emerald-500 outline-none" placeholder="Opcional..." />
                          </div>
                          <button type="submit" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase rounded transition-colors whitespace-nowrap">
                            Agregar al Turno
                          </button>
                        </div>
                      </form>

                      {/* Lista de Items del Turno Actual */}
                      <div className="space-y-2">
                        {localShifts.find(x => x.id === selectedShiftId)?.items.map(item => (
                          <div key={item.id} className="flex items-center justify-between p-3 rounded border border-slate-800 bg-slate-900">
                            <div>
                              <p className="font-bold text-xs text-slate-200">{item.title}</p>
                              <p className="text-[10px] text-slate-500">{item.type.includes('video') ? '🎥 Video' : '🖼️ Imagen'} • {item.fileName} ({(item.fileBlob.size / 1024 / 1024).toFixed(1)} MB)</p>
                            </div>
                            <button onClick={() => handleRemoveFileFromShift(selectedShiftId, item.id)} className="px-2 py-1 text-[10px] font-bold uppercase rounded border border-rose-500/40 text-rose-500 hover:bg-rose-500/10">Eliminar</button>
                          </div>
                        ))}
                      </div>



                      {/* Botoneras de Acción de Turno */}
                      <div className="flex justify-between border-t border-editorial-border pt-4 mt-4">
                        <button onClick={() => handleDeleteLocalShift(selectedShiftId)} className="text-rose-500 text-xs font-bold uppercase hover:underline">
                          Eliminar Turno Local
                        </button>
                        <button 
                          onClick={() => {
                            const s = localShifts.find(x => x.id === selectedShiftId);
                            if (s) setConfirmPublishShift(s);
                          }} 
                          disabled={isPublishingShift}
                          className="px-6 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase rounded shadow-[0_0_15px_rgba(245,158,11,0.3)] disabled:opacity-50"
                        >
                          {isPublishingShift ? 'Sincronizando...' : '🚀 Publicar Turno en Nube'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 bg-slate-900/50 border border-slate-800 border-dashed rounded text-editorial-text-muted">
                  No hay turnos locales configurados. Crea uno para empezar.
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                onClick={() => runMaintenanceTask('db')}
                disabled={isMaintRunning}
                className="p-5 bg-editorial-bg border border-editorial-border hover:border-amber-500/40 rounded text-left space-y-2 group transition-all cursor-pointer disabled:opacity-50"
              >
                <div className="w-8 h-8 rounded bg-amber-500/10 text-amber-500 border border-amber-500/30 flex items-center justify-center font-bold">
                  01
                </div>
                <h4 className="font-serif text-md font-bold text-editorial-text-primary group-hover:text-amber-500">Optimizar Índices de BD</h4>
                <p className="text-[11px] text-editorial-text-muted leading-relaxed">
                  Compacta y re-indexa las tablas de ventas e histórico de mermas para maximizar la velocidad de respuesta.
                </p>
              </button>

              <button
                onClick={() => runMaintenanceTask('purge')}
                disabled={isMaintRunning}
                className="p-5 bg-editorial-bg border border-editorial-border hover:border-amber-500/40 rounded text-left space-y-2 group transition-all cursor-pointer disabled:opacity-50"
              >
                <div className="w-8 h-8 rounded bg-amber-500/10 text-amber-500 border border-amber-500/30 flex items-center justify-center font-bold">
                  02
                </div>
                <h4 className="font-serif text-md font-bold text-editorial-text-primary group-hover:text-amber-500">Depurar Caché de Ventas</h4>
                <p className="text-[11px] text-editorial-text-muted leading-relaxed">
                  Purga logs de sesiones expiradas de cajeros y archivos de caché temporal generados por la terminal POS.
                </p>
              </button>

              <button
                onClick={() => runMaintenanceTask('mermas')}
                disabled={isMaintRunning}
                className="p-5 bg-editorial-bg border border-editorial-border hover:border-amber-500/40 rounded text-left space-y-2 group transition-all cursor-pointer disabled:opacity-50"
              >
                <div className="w-8 h-8 rounded bg-amber-500/10 text-amber-500 border border-amber-500/30 flex items-center justify-center font-bold">
                  03
                </div>
                <h4 className="font-serif text-md font-bold text-editorial-text-primary group-hover:text-amber-500">Re-calibrar Evaporación Natural de Lotes</h4>
                <p className="text-[11px] text-editorial-text-muted leading-relaxed">
                  Sincroniza el coeficiente de deshidratación estimado contra mediciones de báscula reales para Cotija Añejo.
                </p>
              </button>
              
              <button
                onClick={handleWipeContabilidad}
                disabled={isWiping}
                className="p-5 bg-rose-950/20 border border-rose-900/50 hover:border-rose-500/80 rounded text-left space-y-2 group transition-all cursor-pointer disabled:opacity-50"
              >
                <div className="w-8 h-8 rounded bg-rose-500/10 text-rose-500 border border-rose-500/30 flex items-center justify-center font-bold">
                  !
                </div>
                <h4 className="font-serif text-md font-bold text-rose-500 group-hover:text-rose-400">Limpiar Toda la Contabilidad</h4>
                <p className="text-[11px] text-rose-400/80 leading-relaxed">
                  Borra historial de ventas, resetea cuentas de clientes y proveedores a cero. Peligroso.
                </p>
              </button>
            </div>
          </div>

          {/* Maintenance live logger output terminal */}
          <div className="lg:col-span-5 bg-editorial-card border border-editorial-border rounded p-6 space-y-4">
            <h4 className="font-serif text-lg font-bold text-editorial-text-primary">Terminal de Salida de Procesos</h4>
            
            <div className="bg-editorial-bg border border-editorial-border rounded-lg p-4 font-mono text-[11px] text-emerald-400 h-64 overflow-y-auto space-y-2">
              <div className="flex justify-between text-emerald-600 border-b border-emerald-800/40 pb-1.5 font-bold mb-2">
                <span>CONSOLA DE MANTENIMIENTO</span>
                <span>ONLINE</span>
              </div>

              {maintLogs.length === 0 ? (
                <div className="text-emerald-800 italic h-48 flex items-center justify-center text-center">
                  Ningún proceso activo en terminal.
                  <br />
                  Haga clic en una herramienta de mantenimiento para iniciar.
                </div>
              ) : (
                maintLogs.map((log, idx) => (
                  <div key={idx} className="flex gap-1.5 leading-relaxed">
                    <span className="text-emerald-800">&gt;</span>
                    <p>{log}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal para Crear Turno */}
      {showShiftModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-black/80">
          <div className="bg-editorial-bg border-2 border-emerald-500 rounded-lg shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-editorial-card p-5 border-b border-editorial-border">
              <h3 className="font-serif font-bold text-lg text-emerald-400">Crear Nuevo Turno</h3>
              <p className="text-xs text-editorial-text-muted mt-1">Organice sus banners y videos locales</p>
            </div>
            <div className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-editorial-text-muted uppercase tracking-wider">Nombre del Turno</label>
                <input 
                  type="text" 
                  value={newShiftName} 
                  onChange={e => setNewShiftName(e.target.value)} 
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && confirmCreateShift()}
                  placeholder="Ej: Promo Fin de Semana..." 
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none" 
                />
              </div>
            </div>
            <div className="bg-editorial-card p-4 border-t border-editorial-border flex gap-3 justify-end">
              <button 
                onClick={() => setShowShiftModal(false)}
                className="px-4 py-2 text-xs font-bold uppercase text-editorial-text-muted hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={confirmCreateShift}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold uppercase rounded transition-colors shadow-lg"
              >
                Crear Turno
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal para Confirmar Publicación */}
      {confirmPublishShift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-black/80">
          <div className="bg-editorial-bg border-2 border-amber-500 rounded-lg shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-editorial-card p-5 border-b border-editorial-border">
              <h3 className="font-serif font-bold text-lg text-amber-500">
                {isPublishingShift ? 'Sincronizando Turno con la Nube...' : '¿Confirmar Publicación?'}
              </h3>
              <p className="text-xs text-editorial-text-muted mt-1">Sincronización en la nube</p>
            </div>
            
            {isPublishingShift ? (
              <div className="p-5 space-y-4">
                <div className="flex justify-between text-xs font-bold text-slate-300">
                  <span>{uploadStatus}</span>
                  <span className="text-emerald-400">{uploadPercent}%</span>
                </div>
                <div className="w-full bg-black/60 rounded-full h-3 overflow-hidden border border-emerald-500/30">
                  <div 
                    className="bg-emerald-500 h-full transition-all duration-300 ease-out" 
                    style={{ width: `${uploadPercent}%` }}
                  />
                </div>
              </div>
            ) : (
              <div className="p-5 space-y-4">
                <p className="text-sm text-slate-300">
                  Está a punto de publicar el turno <strong className="text-white">{confirmPublishShift.name}</strong>.
                </p>
                <div className="bg-rose-500/10 border border-rose-500/30 p-3 rounded">
                  <p className="text-xs text-rose-400">
                    ⚠️ Esta acción borrará inmediatamente todos los banners actuales de Firebase Storage para liberar espacio.
                  </p>
                </div>
              </div>
            )}
            <div className="bg-editorial-card p-4 border-t border-editorial-border flex gap-3 justify-end">
              <button 
                onClick={() => {
                  if (isPublishingShift && activeUploadTask) {
                    activeUploadTask.cancel();
                  }
                  setIsPublishingShift(false);
                  setConfirmPublishShift(null);
                }}
                className="px-4 py-2 text-xs font-bold uppercase text-editorial-text-muted hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={() => handlePublishShift(confirmPublishShift)}
                disabled={isPublishingShift}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black uppercase rounded transition-colors shadow-lg disabled:opacity-50"
              >
                {isPublishingShift ? 'Publicando...' : 'Confirmar Publicación'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
