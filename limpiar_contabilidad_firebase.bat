@echo off
echo ========================================================
echo   Script de Limpieza de Contabilidad - Queseria KALU
echo ========================================================
echo.
echo ADVERTENCIA: Esto borrara TODO el historial de ventas,
echo gastos, cierres y contabilidad general en Firebase.
echo Los productos, clientes y proveedores se mantendran.
echo.
pause

echo.
echo Limpiando transacciones y contabilidad...
call npx firebase firestore:delete transactions -r --force --project sistemekalu

echo.
echo ¡Limpieza completada! El sistema esta ahora en cero (sin numeros locos).
pause
