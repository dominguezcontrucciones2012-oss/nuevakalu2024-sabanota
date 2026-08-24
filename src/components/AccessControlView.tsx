import { QrCode, UserCircle, Users, BrainCircuit } from 'lucide-react';

interface AccessControlViewProps {
  isAdmin: boolean;
}

export default function AccessControlView({ isAdmin }: AccessControlViewProps) {
  const qrData = [
    {
      id: 'cliente',
      title: 'Portal del Cliente',
      desc: 'Acceso para clientes y compra de repuestos/quesos',
      url: `${window.location.origin}/?portal=cliente`,
      icon: UserCircle,
      color: 'amber'
    },
    {
      id: 'productor',
      title: 'Portal del Productor',
      desc: 'Acceso para productores y solicitud de insumos',
      url: `${window.location.origin}/?portal=productor`,
      icon: Users,
      color: 'emerald'
    },
    {
      id: 'contador',
      title: 'Portal del Contador (IA)',
      desc: 'Acceso directo a la IA y balances (Solo Admin)',
      url: `${window.location.origin}/?portal=contador`,
      icon: BrainCircuit,
      color: 'brand-accent'
    }
  ];

  return (
    <div className="space-y-8 animate-fade-in max-w-7xl mx-auto pb-16">
      <div className="border-b border-editorial-border pb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-2.5 h-2.5 rounded-full bg-brand-accent" />
          <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-editorial-text-muted">
            CONTROL DE ACCESO
          </span>
        </div>
        <h2 className="font-serif text-3xl font-bold tracking-tight text-editorial-text-primary">
          Códigos QR de Acceso Externo
        </h2>
        <p className="text-xs text-editorial-text-muted/80 max-w-3xl mt-2 leading-relaxed">
          Escanee los siguientes códigos para abrir rápidamente los portales independientes en cualquier dispositivo móvil. 
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {qrData.map((qr) => (
          <div key={qr.id} className="bg-editorial-card border border-editorial-border rounded-xl p-6 flex flex-col items-center text-center shadow-sm hover:shadow-lg transition-all group">
            <div className={`w-12 h-12 rounded-full mb-4 flex items-center justify-center bg-${qr.color}-500/10 border border-${qr.color}-500/30`}>
              <qr.icon className={`w-6 h-6 text-${qr.color}-500`} />
            </div>
            
            <h3 className="font-serif text-lg font-bold text-editorial-text-primary mb-1">{qr.title}</h3>
            <p className="text-[10px] text-editorial-text-muted font-mono uppercase tracking-wider mb-6 h-8">{qr.desc}</p>
            
            <div className="bg-white p-3 rounded-xl shadow-inner mb-4 relative overflow-hidden group-hover:scale-105 transition-transform duration-300">
              <img 
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qr.url)}`}
                alt={`QR ${qr.title}`}
                className="w-40 h-40 mix-blend-multiply"
              />
            </div>
            
            <a 
              href={qr.url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-[10px] font-mono font-bold text-brand-accent hover:underline uppercase tracking-widest flex items-center gap-1 mt-auto"
            >
              <QrCode className="w-3.5 h-3.5" />
              Ver Enlace
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
