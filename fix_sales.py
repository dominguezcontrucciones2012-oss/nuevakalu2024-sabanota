import re

with open('src/App.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add salesState
old_state = """  const [transactionsState, setTransactionsState] = useState<Transaction[]>(INITIAL_TRANSACTIONS);
  useEffect(() => {
    const unsubTx = onSnapshot(collection(db, 'transactions'), snap => {
      const data = snap.docs.map(d => ({ ...d.data(), id: d.id })) as Transaction[];
      if (data.length > 0) {
        // Sort by date descending
        data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setTransactionsState(data);
      }
    });
    return () => unsubTx();
  }, []);
  const transactions = transactionsState;
  const setTransactions = setTransactionsState;"""

new_state = """  const [transactionsState, setTransactionsState] = useState<Transaction[]>(INITIAL_TRANSACTIONS);
  const [salesState, setSalesState] = useState<any[]>([]);

  useEffect(() => {
    const unsubTx = onSnapshot(collection(db, 'transactions'), snap => {
      const data = snap.docs.map(d => ({ ...d.data(), id: d.id })) as Transaction[];
      if (data.length > 0) {
        data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setTransactionsState(data);
      }
    });
    const unsubSales = onSnapshot(collection(db, 'sales'), snap => {
      const data = snap.docs.map(d => ({ ...d.data(), id: d.id }));
      if (data.length > 0) {
        data.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setSalesState(data);
      }
    });
    return () => {
      unsubTx();
      unsubSales();
    };
  }, []);
  const transactions = transactionsState;
  const setTransactions = setTransactionsState;"""

content = content.replace(old_state, new_state)

# 2. Update CheesePOSView salesHistory
old_prop = "salesHistory={transactions.filter(t => t.category === 'ventas')}"
new_prop = "salesHistory={salesState}"
content = content.replace(old_prop, new_prop)

with open('src/App.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated salesHistory injection")
