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
 * NodeMap — Infrastructural pharmacy node + rider tracking map.
 * Intentionally minimal: dark-styled, no controls clutter, data-only markers.
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

    // Pharmacy node markers
    nodes.forEach(node => {
      const el = document.createElement("div");
      el.style.cssText = `
        width: 10px; height: 10px; border-radius: 50%;
        background: ${node.isAssigned ? "#2DD4BF" : "#4A5568"};
        border: 2px solid ${node.isAssigned ? "#2DD4BF" : "#718096"};
        box-shadow: 0 0 0 3px ${node.isAssigned ? "rgba(45,212,191,0.2)" : "transparent"};
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
        border: 2px solid #FCD34D;
        box-shadow: 0 0 0 4px rgba(245,158,11,0.25);
        animation: pulse 2s infinite;
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
        background: #FFFFFF;
        border: 2px solid #CBD5E0;
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

    // Apply dark/clinical map style
    map.setOptions({
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      zoomControl: false,
      gestureHandling: "cooperative",
      styles: [
        { elementType: "geometry",        stylers: [{ color: "#1a1f2e" }] },
        { elementType: "labels.text.fill",stylers: [{ color: "#6b7280" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#1a1f2e" }] },
        { featureType: "road",            elementType: "geometry",       stylers: [{ color: "#252d3d" }] },
        { featureType: "road",            elementType: "geometry.stroke",stylers: [{ color: "#1a1f2e" }] },
        { featureType: "road.highway",    elementType: "geometry",       stylers: [{ color: "#2d3748" }] },
        { featureType: "water",           elementType: "geometry",       stylers: [{ color: "#0f1420" }] },
        { featureType: "poi",             stylers: [{ visibility: "off" }] },
        { featureType: "transit",         stylers: [{ visibility: "off" }] },
        { featureType: "administrative",  elementType: "geometry",       stylers: [{ color: "#252d3d" }] },
        { featureType: "landscape",       elementType: "geometry",       stylers: [{ color: "#1a1f2e" }] },
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
