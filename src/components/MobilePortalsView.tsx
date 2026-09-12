import { CheeseProduct, ClientProfile, SupplierProfile, MobileOrder, CheeseTrip, Transaction, CentralVaultBalance, BusinessSettings } from '../types';
import ClientPortal from './portals/ClientPortal';
import ProducerPortal from './portals/ProducerPortal';
import AccountantPortal from './portals/AccountantPortal';

export interface MobilePortalsViewProps {
  products: CheeseProduct[];
  clients: ClientProfile[];
  suppliers: SupplierProfile[];
  mobileOrders: MobileOrder[];
  onAddMobileOrder: (order: MobileOrder) => void;
  onDeliverMobileOrder: (orderId: string) => void;
  onCancelMobileOrder: (orderId: string) => void;
  onAddNotification: (msg: string, type: 'success' | 'info' | 'warning') => void;
  isolatedType?: 'cliente' | 'productor' | 'proveedor' | 'contador';
  isolatedId?: string;
  cheeseTrips?: CheeseTrip[];
  transactions?: Transaction[];
  settings?: BusinessSettings;
  vaultBalance?: CentralVaultBalance;
  exchangeRate?: number;
  onCreateTrip?: (trip: Omit<CheeseTrip, 'id'>) => Promise<void>;
  onUpdateTrip?: (id: string, updates: Partial<CheeseTrip>) => Promise<void>;
  onSettleTrip?: (id: string, settlementData: Partial<CheeseTrip>) => Promise<void>;
  onAddTransaction?: (tx: Partial<Transaction>) => void;
  onUpdateSupplier?: (id: string, updates: Partial<SupplierProfile>) => void;
  onUpdateVault?: (updates: Partial<CentralVaultBalance>) => Promise<void>;
}

export default function MobilePortalsView(props: MobilePortalsViewProps) {
  const { isolatedType } = props;

  if (isolatedType === 'cliente') {
    return <ClientPortal {...props} />;
  }

  if (isolatedType === 'productor' || isolatedType === 'proveedor') {
    return <ProducerPortal {...props} />;
  }

  if (isolatedType === 'contador') {
    return <AccountantPortal {...props} />;
  }

  // Fallback for non-isolated mode: Since ClientPortal currently holds the entire 
  // flex-row layout of the 3 portals for the mockups view, we just render it.
  return <ClientPortal {...props} />;
}
