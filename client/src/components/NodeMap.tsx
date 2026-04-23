/// <reference types="@types/google.maps" />

import { useRef, useEffect, useCallback } from "react";
import { MapView } from "./Map";

export interface PharmacyNode {
  id: number;
  name: string;
  lat: number;
  lng: number;
  isAssigned?: boolean;
}

export interface RiderPosition {
  lat: number;
  lng: number;
  heading?: number;
}

interface NodeMapProps {
  nodes?: PharmacyNode[];
  riderPosition?: RiderPosition | null;
  deliveryLat?: number;
  deliveryLng?: number;
  className?: string;
  centerLat?: number;
  centerLng?: number;
  zoom?: number;
}

/**
 * NodeMap — Pharmacy location + rider tracking map.
 * Clinical light style — no dark backgrounds, no glow effects.
 */
export function NodeMap({
  nodes = [],
  riderPosition,
  deliveryLat,
  deliveryLng,
  className,
  centerLat = 19.076,
  centerLng = 72.8777,
  zoom = 14,
}: NodeMapProps) {
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);

  const clearMarkers = useCallback(() => {
    markersRef.current.forEach(m => { m.map = null; });
    markersRef.current = [];
  }, []);

  const addMarkers = useCallback(() => {
    if (!mapRef.current || !window.google) return;
    clearMarkers();

    // Pharmacy location markers
    nodes.forEach(node => {
      const el = document.createElement("div");
      el.style.cssText = `
        width: 10px; height: 10px; border-radius: 50%;
        background: ${node.isAssigned ? "#1F6FEB" : "#94A3B8"};
        border: 2px solid white;
        box-shadow: 0 1px 4px rgba(0,0,0,0.15);
      `;
      const marker = new window.google.maps.marker.AdvancedMarkerElement({
        map: mapRef.current!,
        position: { lat: node.lat, lng: node.lng },
        title: node.name,
        content: el,
      });
      markersRef.current.push(marker);
    });

    // Rider marker
    if (riderPosition) {
      const riderEl = document.createElement("div");
      riderEl.style.cssText = `
        width: 12px; height: 12px; border-radius: 50%;
        background: #F59E0B;
        border: 2px solid white;
        box-shadow: 0 1px 4px rgba(0,0,0,0.15);
      `;
      const riderMarker = new window.google.maps.marker.AdvancedMarkerElement({
        map: mapRef.current!,
        position: { lat: riderPosition.lat, lng: riderPosition.lng },
        title: "Rider",
        content: riderEl,
      });
      markersRef.current.push(riderMarker);
    }

    // Delivery destination marker
    if (deliveryLat && deliveryLng) {
      const destEl = document.createElement("div");
      destEl.style.cssText = `
        width: 10px; height: 10px; border-radius: 2px;
        background: #1F6FEB;
        border: 2px solid white;
        box-shadow: 0 1px 4px rgba(0,0,0,0.15);
        transform: rotate(45deg);
      `;
      const destMarker = new window.google.maps.marker.AdvancedMarkerElement({
        map: mapRef.current!,
        position: { lat: deliveryLat, lng: deliveryLng },
        title: "Delivery address",
        content: destEl,
      });
      markersRef.current.push(destMarker);
    }
  }, [nodes, riderPosition, deliveryLat, deliveryLng, clearMarkers]);

  useEffect(() => {
    if (mapRef.current) {
      addMarkers();
    }
  }, [addMarkers]);

  const handleMapReady = useCallback((map: google.maps.Map) => {
    mapRef.current = map;

    // Clinical light map style — minimal, clean, no POI clutter
    map.setOptions({
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      zoomControl: false,
      gestureHandling: "cooperative",
      styles: [
        { featureType: "poi",          stylers: [{ visibility: "off" }] },
        { featureType: "transit",      stylers: [{ visibility: "off" }] },
        { featureType: "road",         elementType: "geometry",       stylers: [{ color: "#F1F5F9" }] },
        { featureType: "road.highway", elementType: "geometry",       stylers: [{ color: "#E2E8F0" }] },
        { featureType: "water",        elementType: "geometry",       stylers: [{ color: "#DBEAFE" }] },
        { featureType: "landscape",    elementType: "geometry",       stylers: [{ color: "#F8FAFC" }] },
        { elementType: "labels.text.fill",   stylers: [{ color: "#64748B" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#FFFFFF" }] },
      ],
    });

    addMarkers();
  }, [addMarkers]);

  return (
    <MapView
      className={className}
      initialCenter={{ lat: centerLat, lng: centerLng }}
      initialZoom={zoom}
      onMapReady={handleMapReady}
    />
  );
}
