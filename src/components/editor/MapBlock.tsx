import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from 'react-leaflet'
import { NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { Component, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  MAP_DEFAULT_SOURCE,
  mapOsmHref,
  parseMapSpec,
  serializeMapSpec,
  type MapMarker,
  type MapSpec,
} from '@/lib/editor/map'
import 'leaflet/dist/leaflet.css'

class MapErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('[scribe-map]', error, info.componentStack)
  }

  render() {
    if (this.state.failed) return this.props.fallback
    return this.props.children
  }
}

function SyncView({ spec }: { spec: MapSpec }) {
  const map = useMap()
  useEffect(() => {
    map.setView([spec.lat, spec.lng], spec.zoom)
    const timer = window.setTimeout(() => map.invalidateSize(), 80)
    return () => window.clearTimeout(timer)
  }, [map, spec.lat, spec.lng, spec.zoom])
  return null
}

function StaticFallback({ spec }: { spec: MapSpec }) {
  const { t } = useTranslation()
  return (
    <div className="map-block__fallback">
      <strong>{spec.title || t('map.fallbackTitle')}</strong>
      <span>
        {spec.lat.toFixed(4)}, {spec.lng.toFixed(4)}
      </span>
      <a href={mapOsmHref(spec)} target="_blank" rel="noreferrer">
        {t('map.openOsm')}
      </a>
    </div>
  )
}

function MapStage({ spec }: { spec: MapSpec }) {
  const stageRef = useRef<HTMLDivElement>(null)
  const [live, setLive] = useState(false)

  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const enable = () => {
      if (el.clientWidth >= 40 && el.clientHeight >= 40) setLive(true)
    }
    enable()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(enable)
    observer?.observe(el)
    return () => observer?.disconnect()
  }, [])

  return (
    <div ref={stageRef} className="map-block__stage" contentEditable={false}>
      {spec.title ? <div className="map-block__title">{spec.title}</div> : null}
      {live ? (
        <MapErrorBoundary fallback={<StaticFallback spec={spec} />}>
          <LeafletPreview spec={spec} />
        </MapErrorBoundary>
      ) : (
        <StaticFallback spec={spec} />
      )}
    </div>
  )
}

function LeafletPreview({ spec }: { spec: MapSpec }) {
  const { t } = useTranslation()
  const markers = spec.markers.length > 0 ? spec.markers : [{ lat: spec.lat, lng: spec.lng, label: spec.title }]

  return (
    <MapContainer
      center={[spec.lat, spec.lng]}
      zoom={spec.zoom}
      scrollWheelZoom={false}
      className="map-block__leaflet"
      attributionControl
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <SyncView spec={spec} />
      {markers.map((marker, index) => (
        <CircleMarker
          key={`${marker.lat}-${marker.lng}-${index}`}
          center={[marker.lat, marker.lng]}
          radius={8}
          pathOptions={{ color: '#007aff', fillColor: '#007aff', fillOpacity: 0.85, weight: 2 }}
        >
          {marker.label ? <Tooltip direction="top" offset={[0, -8]} opacity={1}>{marker.label}</Tooltip> : null}
        </CircleMarker>
      ))}
      <span className="sr-only">{spec.title || t('map.fallbackTitle')}</span>
    </MapContainer>
  )
}

export function MapBlock({ node, updateAttributes, selected, editor, deleteNode }: NodeViewProps) {
  const { t } = useTranslation()
  const currentSource = String(node.attrs.source ?? MAP_DEFAULT_SOURCE)
  const editable = editor.isEditable
  const [editing, setEditing] = useState(false)
  const [advancedJson, setAdvancedJson] = useState(false)
  const [draft, setDraft] = useState(currentSource)
  const [form, setForm] = useState<MapSpec>(() => {
    const parsed = parseMapSpec(currentSource)
    return parsed.ok
      ? parsed.spec
      : { lat: 48.1486, lng: 17.1077, zoom: 13, title: '', markers: [] }
  })
  const parsed = useMemo(() => parseMapSpec(currentSource), [currentSource])

  useEffect(() => {
    if (!editing) {
      setDraft(currentSource)
      const next = parseMapSpec(currentSource)
      if (next.ok) setForm(next.spec)
    }
  }, [currentSource, editing])

  function commit() {
    if (advancedJson) {
      updateAttributes({ source: draft.trim() || MAP_DEFAULT_SOURCE })
    } else {
      updateAttributes({ source: serializeMapSpec(form) })
    }
    setEditing(false)
    setAdvancedJson(false)
  }

  function updateMarker(index: number, patch: Partial<MapMarker>) {
    setForm((prev) => ({
      ...prev,
      markers: prev.markers.map((marker, i) => (i === index ? { ...marker, ...patch } : marker)),
    }))
  }

  function addMarker() {
    setForm((prev) => ({
      ...prev,
      markers: [...prev.markers, { lat: prev.lat, lng: prev.lng, label: '' }],
    }))
  }

  function removeMarker(index: number) {
    setForm((prev) => ({
      ...prev,
      markers: prev.markers.filter((_, i) => i !== index),
    }))
  }

  return (
    <NodeViewWrapper
      className={cn('map-block', selected && 'is-selected', editing && 'is-editing')}
      data-type="leaflet-map"
      data-source={currentSource}
    >
      {editable ? (
        <div className="map-block__toolbar" contentEditable={false}>
          <span className="map-block__provider">{t('map.provider')}</span>
          <button
            type="button"
            className="map-block__btn"
            onClick={() => {
              if (editing) commit()
              else {
                setDraft(currentSource)
                const next = parseMapSpec(currentSource)
                if (next.ok) setForm(next.spec)
                setEditing(true)
              }
            }}
          >
            {editing ? t('map.done') : t('map.edit')}
          </button>
          {editing ? (
            <>
              <button
                type="button"
                className="map-block__btn"
                onClick={() => {
                  if (!advancedJson) setDraft(serializeMapSpec(form))
                  else {
                    const next = parseMapSpec(draft)
                    if (next.ok) setForm(next.spec)
                  }
                  setAdvancedJson((value) => !value)
                }}
              >
                {advancedJson ? t('map.formMode') : t('map.jsonMode')}
              </button>
              <button type="button" className="map-block__btn" onClick={() => setEditing(false)}>
                {t('map.cancel')}
              </button>
            </>
          ) : (
            <button type="button" className="map-block__btn map-block__btn--danger" onClick={() => deleteNode()}>
              <Trash2 className="h-3.5 w-3.5" />
              {t('map.delete')}
            </button>
          )}
        </div>
      ) : null}

      {editing ? (
        advancedJson ? (
          <textarea
            className="map-block__source"
            value={draft}
            spellCheck={false}
            rows={10}
            onChange={(event) => setDraft(event.target.value)}
            onMouseDown={(event) => event.stopPropagation()}
          />
        ) : (
          <div className="map-block__form" contentEditable={false} onMouseDown={(event) => event.stopPropagation()}>
            <label>
              <span>{t('map.titleLabel')}</span>
              <input
                value={form.title ?? ''}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              />
            </label>
            <div className="map-block__form-row">
              <label>
                <span>Lat</span>
                <input
                  type="number"
                  step="0.0001"
                  value={form.lat}
                  onChange={(event) => setForm((prev) => ({ ...prev, lat: Number(event.target.value) }))}
                />
              </label>
              <label>
                <span>Lng</span>
                <input
                  type="number"
                  step="0.0001"
                  value={form.lng}
                  onChange={(event) => setForm((prev) => ({ ...prev, lng: Number(event.target.value) }))}
                />
              </label>
              <label>
                <span>Zoom</span>
                <input
                  type="number"
                  min={1}
                  max={19}
                  value={form.zoom}
                  onChange={(event) => setForm((prev) => ({ ...prev, zoom: Number(event.target.value) }))}
                />
              </label>
            </div>
            <div className="map-block__markers">
              <div className="map-block__markers-head">
                <strong>{t('map.markers')}</strong>
                <button type="button" className="map-block__btn" onClick={addMarker}>
                  {t('map.addMarker')}
                </button>
              </div>
              {form.markers.map((marker, index) => (
                <div key={index} className="map-block__marker-row">
                  <input
                    type="number"
                    step="0.0001"
                    value={marker.lat}
                    aria-label="lat"
                    onChange={(event) => updateMarker(index, { lat: Number(event.target.value) })}
                  />
                  <input
                    type="number"
                    step="0.0001"
                    value={marker.lng}
                    aria-label="lng"
                    onChange={(event) => updateMarker(index, { lng: Number(event.target.value) })}
                  />
                  <input
                    value={marker.label ?? ''}
                    placeholder={t('map.markerLabel')}
                    onChange={(event) => updateMarker(index, { label: event.target.value })}
                  />
                  <button type="button" className="map-block__btn map-block__btn--danger" onClick={() => removeMarker(index)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )
      ) : parsed.ok ? (
        <MapStage spec={parsed.spec} />
      ) : (
        <div className="map-block__error" contentEditable={false}>
          {parsed.error}
        </div>
      )}
    </NodeViewWrapper>
  )
}
