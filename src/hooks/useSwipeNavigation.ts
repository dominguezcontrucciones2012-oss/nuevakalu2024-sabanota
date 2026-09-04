import React, { useRef, useCallback } from 'react';

interface SwipeNavigationOptions {
  tabs: string[];
  activeTab: string;
  onTabChange: (newTab: any) => void;
  threshold?: number;
  disabled?: boolean;
}

export function useSwipeNavigation({
  tabs,
  activeTab,
  onTabChange,
  threshold = 60,
  disabled = false
}: SwipeNavigationOptions) {
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const isHorizontalSwipe = useRef<boolean | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled || e.touches.length !== 1) return;
    
    // Ignorar si el toque se origina en sliders nativos, inputs de rango o mapas
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea, select, [data-no-swipe="true"]')) {
      return;
    }

    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isHorizontalSwipe.current = null;
  }, [disabled]);

 const onTouchMove = useCallback((e: React.TouchEvent) => {
 if (disabled || touchStartX.current === null || touchStartY.current === null) return;

 const currentX = e.touches[0].clientX;
 const currentY = e.touches[0].clientY;

 const deltaX = Math.abs(currentX - touchStartX.current);
 const deltaY = Math.abs(currentY - touchStartY.current);

 // Detectar intención del usuario: Solo capturar si el movimiento horizontal es dominante
 if (isHorizontalSwipe.current === null && (deltaX > 10 || deltaY > 10)) {
 if (deltaX > deltaY * 1.3) {
 isHorizontalSwipe.current = true;
 } else {
 // Es un scroll vertical normal, no interferir
 isHorizontalSwipe.current = false;
 }
 }
 }, [disabled]);

 const onTouchEnd = useCallback((e: React.TouchEvent) => {
 if (disabled || touchStartX.current === null || isHorizontalSwipe.current !== true) {
 touchStartX.current = null;
 touchStartY.current = null;
 isHorizontalSwipe.current = null;
 return;
 }

 const touchEndX = e.changedTouches[0].clientX;
 const distance = touchEndX - touchStartX.current;

 const currentIndex = tabs.indexOf(activeTab);
 if (currentIndex !== -1) {
 if (distance < -threshold && currentIndex < tabs.length - 1) {
 // Deslizar izquierda -> siguiente pestaña
 onTabChange(tabs[currentIndex + 1]);
 } else if (distance > threshold && currentIndex > 0) {
 // Deslizar derecha -> pestaña anterior
 onTabChange(tabs[currentIndex - 1]);
 }
 }

 touchStartX.current = null;
 touchStartY.current = null;
 isHorizontalSwipe.current = null;
 }, [tabs, activeTab, onTabChange, threshold, disabled]);

 return {
 onTouchStart,
 onTouchMove,
 onTouchEnd
 };
}
