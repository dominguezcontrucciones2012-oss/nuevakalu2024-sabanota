# 📋 REGISTRO DE CAMBIOS Y CONTROL DE VERSIONES (CHANGELOG)
**Proyecto:** Kalú CRM Oficial - Sabanota  
**Última Actualización:** 13 de Septiembre, 2026

---

## 🚀 Versión 2.4.0 (13/09/2026) - Módulo Contable, Gira San Juan y Portal de Productores

### 1. 🏛️ Ficha Administradora (`adminLedger`)
- **Modo Acordeón Cronológico Jerárquico:**
  - Estructuración y navegación por niveles colapsables: **Año ➔ Mes ➔ Día**.
  - Cálculo instantáneo de sub-totales de **Entradas (+)**, **Salidas (-)** y **Saldo Neto** agrupados por día, mes y año.
- **Doble Indicador de Fondo:**
  - Muestra la **Bolsa Total Asignada** y la **Bolsa Pendiente** (remanente disponible tras amortizaciones).
- **Puente de Amortización Automática:**
  - Al realizar pagos a productores, gastos operativos o aprobar notas de voz con desembolso, el sistema impacta automáticamente la gira activa en curso (`cheeseTrips`).

### 2. 🚛 Gira a San Juan (`cheeseTrips`)
- **Sincronización en Tiempo Real:**
  - Comparte de forma estricta el fondo en custodia con la Ficha Administradora.
  - Indicadores visuales claros en las tarjetas de viaje: **Bolsa Inicial**, **Total Amortizado (Facturas + Pagos + Presupuesto)** y **Deuda Pendiente**.
- **Amortización Multifuente:**
  - Se amortiza automáticamente al registrar facturas en `InvoiceUploadView`, al pagar productores en `AdminAccountLedgerView` o al abonar pasivos en `BudgetControlView`.

### 3. 📊 Control Presupuestario (`BudgetControlView.tsx` / `business_debts`)
- **Enlace Espejo al Pagar Deudas:**
  - Al procesar un pago o abono desde el Control Presupuestario (Cashea, nóminas, servicios, etc.), el sistema genera el débito en el Haber (-) de `adminLedger` y amortiza simultáneamente la deuda de la gira activa en `cheeseTrips`.

### 4. 👨‍🌾 Portal de Productores (`ProducerPortal.tsx`)
- **Cálculo de Métricas y Puntos Kalú:**
  - Unificación y sincronización de kilos semanales, histórico anual (`totalAnoKg`) y puntos de fidelización (`puntosKalu`).

---

## 🔒 Políticas de Seguridad y Despliegue
1. **Protección del `.env`:** El archivo de variables de entorno y credenciales nunca se incluye en el control de versiones ni se sobrescribe en el servidor.
2. **Persistencia de Base de Datos:** Las carpetas de datos persistentes (`data/`) están aisladas y protegidas contra sobrescrituras durante los deploys.
