import re

with open('src/components/CheesePOSView.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Rename CheesePOSView to CheesePOSViewInner
content = content.replace("export default function CheesePOSView({", "function CheesePOSViewInner({")

# 2. Add ErrorBoundary wrapper at the end
wrapper = """
class CheesePOSErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, errorMsg: string }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMsg: '' };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, errorMsg: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-center bg-editorial-bg min-h-[400px] flex flex-col items-center justify-center">
          <AlertCircle className="w-12 h-12 text-rose-500 mb-4" />
          <h2 className="text-xl font-bold text-rose-500 uppercase tracking-widest font-serif mb-2">Error de Interfaz Prevenido</h2>
          <p className="text-editorial-text-muted font-mono text-xs mb-4">{this.state.errorMsg}</p>
          <button onClick={() => window.location.reload()} className="px-6 py-2 bg-amber-500 text-editorial-bg font-bold font-mono text-xs uppercase cursor-pointer rounded-none hover:bg-amber-400">Reiniciar Módulo</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function CheesePOSView(props: CheesePOSViewProps) {
  return (
    <CheesePOSErrorBoundary>
      <CheesePOSViewInner {...props} />
    </CheesePOSErrorBoundary>
  );
}
"""

content = content + wrapper

with open('src/components/CheesePOSView.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('ErrorBoundary added')
