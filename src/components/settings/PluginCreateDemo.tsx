import { Check, Play, Plus, RotateCcw, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import helloPackage from '@/lib/plugins/examples/hello.scribe-ext.json'
import { installPluginFromBytes, listPlugins } from '@/lib/plugins'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'

const DEMO_CODE = `export default function activate(api) {
  api.commands.register({
    id: 'hello',
    title: api.i18n.t('cmd.title', 'Say hello'),
    run: () => {
      api.notify.success('Hello from my plugin')
      api.log('Demo plugin ran')
    },
  })
}`

const DEMO_STEPS = ['template', 'name', 'code', 'install', 'use'] as const

type PluginCreateDemoProps = {
  onOpenCreate: () => void
  onInstalled?: (pluginId: string) => void
}

export function PluginCreateDemo({ onOpenCreate, onInstalled }: PluginCreateDemoProps) {
  const { t } = useTranslation()
  const [stepIndex, setStepIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [typedCode, setTypedCode] = useState('')
  const [installing, setInstalling] = useState(false)
  const [doneFlash, setDoneFlash] = useState(false)
  const playGen = useRef(0)

  const step = DEMO_STEPS[stepIndex] ?? 'template'
  const demoInstalled = useMemo(
    () => listPlugins().some((plugin) => plugin.manifest.id === helloPackage.manifest.id),
    // refresh when parent re-renders after install via key/tick from outside is enough;
    // also recompute after local install by forcing step state changes
    [installing, stepIndex, doneFlash],
  )

  useEffect(() => {
    if (step !== 'code') {
      setTypedCode(stepIndex > DEMO_STEPS.indexOf('code') ? DEMO_CODE : '')
      return
    }
    setTypedCode('')
    let i = 0
    const timer = window.setInterval(() => {
      i += 3
      setTypedCode(DEMO_CODE.slice(0, i))
      if (i >= DEMO_CODE.length) window.clearInterval(timer)
    }, 28)
    return () => window.clearInterval(timer)
  }, [step, stepIndex])

  useEffect(() => {
    if (!playing) return
    const gen = playGen.current
    const delays = [1400, 1600, 2600, 1600, 1800]
    const timer = window.setTimeout(() => {
      if (playGen.current !== gen) return
      if (stepIndex >= DEMO_STEPS.length - 1) {
        setPlaying(false)
        setDoneFlash(true)
        window.setTimeout(() => setDoneFlash(false), 1200)
        return
      }
      setStepIndex((n) => n + 1)
    }, delays[stepIndex] ?? 1600)
    return () => window.clearTimeout(timer)
  }, [playing, stepIndex])

  function startPlayback() {
    playGen.current += 1
    setDoneFlash(false)
    setStepIndex(0)
    setPlaying(true)
  }

  function resetPlayback() {
    playGen.current += 1
    setPlaying(false)
    setStepIndex(0)
    setTypedCode('')
    setDoneFlash(false)
  }

  async function installDemo() {
    setInstalling(true)
    try {
      if (demoInstalled) {
        toast.success(t('settings.plugins.demo.alreadyInstalled'), helloPackage.manifest.name)
        onInstalled?.(helloPackage.manifest.id)
        return
      }
      const bytes = new TextEncoder().encode(JSON.stringify(helloPackage))
      const entry = await installPluginFromBytes(bytes, 'hello.scribe-ext.json')
      toast.success(t('settings.plugins.demo.installToast'), entry.manifest.name)
      onInstalled?.(entry.manifest.id)
      setStepIndex(DEMO_STEPS.length - 1)
      setDoneFlash(true)
    } catch (error) {
      toast.error(t('settings.plugins.demo.installError'), String(error))
    } finally {
      setInstalling(false)
    }
  }

  return (
    <section className="plugin-demo" aria-label={t('settings.plugins.demo.title')}>
      <div className="plugin-demo-head">
        <div>
          <p className="plugin-demo-kicker">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            {t('settings.plugins.demo.kicker')}
          </p>
          <h2 className="plugin-demo-title">{t('settings.plugins.demo.title')}</h2>
          <p className="plugin-demo-lead">{t('settings.plugins.demo.lead')}</p>
        </div>
        <div className="plugin-demo-actions">
          <Button type="button" size="sm" onClick={startPlayback} disabled={playing}>
            <Play className="h-3.5 w-3.5" />
            {playing ? t('settings.plugins.demo.playing') : t('settings.plugins.demo.play')}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={resetPlayback}>
            <RotateCcw className="h-3.5 w-3.5" />
            {t('settings.plugins.demo.reset')}
          </Button>
        </div>
      </div>

      <ol className="plugin-demo-steps">
        {DEMO_STEPS.map((id, index) => {
          const active = index === stepIndex
          const complete = index < stepIndex || doneFlash
          return (
            <li key={id}>
              <button
                type="button"
                className={cn(
                  'plugin-demo-step',
                  active && 'is-active',
                  complete && 'is-complete',
                )}
                onClick={() => {
                  playGen.current += 1
                  setPlaying(false)
                  setStepIndex(index)
                }}
              >
                <span className="plugin-demo-step-index" aria-hidden>
                  {complete && !active ? <Check className="h-3 w-3" /> : index + 1}
                </span>
                <span className="plugin-demo-step-copy">
                  <span className="plugin-demo-step-title">
                    {t(`settings.plugins.demo.steps.${id}.title`)}
                  </span>
                  <span className="plugin-demo-step-hint">
                    {t(`settings.plugins.demo.steps.${id}.hint`)}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>

      <div className={cn('plugin-demo-stage', doneFlash && 'is-flash')}>
        <div className="plugin-demo-stage-bar">
          <span className="plugin-demo-dot" />
          <span className="plugin-demo-dot" />
          <span className="plugin-demo-dot" />
          <span className="plugin-demo-stage-label">
            {step === 'code'
              ? 'index.js'
              : step === 'name'
                ? 'create-plugin'
                : step === 'use'
                  ? 'command-palette'
                  : 'scribe · extensions'}
          </span>
        </div>

        {step === 'template' && (
          <div className="plugin-demo-panel">
            <p className="plugin-demo-label">{t('settings.plugins.create.templateLabel')}</p>
            <div className="plugin-demo-choice is-selected">
              <strong>{t('settings.plugins.create.templates.command.label')}</strong>
              <span>{t('settings.plugins.create.templates.command.hint')}</span>
            </div>
            <div className="plugin-demo-choice is-dim">
              <strong>{t('settings.plugins.create.templates.slashBlock.label')}</strong>
              <span>{t('settings.plugins.create.templates.slashBlock.hint')}</span>
            </div>
          </div>
        )}

        {step === 'name' && (
          <div className="plugin-demo-panel">
            <label className="plugin-demo-field">
              <span>{t('settings.plugins.create.nameLabel')}</span>
              <span className="plugin-demo-input">
                <span className="plugin-demo-type">{t('settings.plugins.demo.sampleName')}</span>
                <span className="plugin-demo-caret" aria-hidden />
              </span>
            </label>
            <label className="plugin-demo-field">
              <span>{t('settings.plugins.create.idLabel')}</span>
              <span className="plugin-demo-input is-mono">local.demo-hello</span>
            </label>
          </div>
        )}

        {step === 'code' && (
          <pre className="plugin-demo-code">
            {typedCode}
            <span className="plugin-demo-caret" aria-hidden />
          </pre>
        )}

        {step === 'install' && (
          <div className="plugin-demo-panel plugin-demo-install">
            <div className="plugin-demo-progress">
              <span style={{ width: playing || doneFlash ? '100%' : '62%' }} />
            </div>
            <p className="m-0 text-[13px] font-medium">
              {t('settings.plugins.demo.installingLine')}
            </p>
            <p className="plugin-demo-muted m-0">
              local.demo-hello · commands · defaultEnabled
            </p>
          </div>
        )}

        {step === 'use' && (
          <div className="plugin-demo-panel plugin-demo-palette">
            <div className="plugin-demo-palette-search">⌘K · hello</div>
            <div className="plugin-demo-palette-item is-selected">
              <span>{t('settings.plugins.demo.paletteItem')}</span>
              <kbd>↵</kbd>
            </div>
            <div className={cn('plugin-demo-toast', (playing || doneFlash) && 'is-show')}>
              {t('settings.plugins.demo.toastLine')}
            </div>
          </div>
        )}
      </div>

      <div className="plugin-demo-cta">
        <Button type="button" size="sm" onClick={onOpenCreate}>
          <Plus className="h-3.5 w-3.5" />
          {t('settings.plugins.demo.tryWizard')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={installing}
          onClick={() => void installDemo()}
        >
          {installing
            ? t('settings.plugins.installing')
            : demoInstalled
              ? t('settings.plugins.demo.openDemo')
              : t('settings.plugins.demo.installDemo')}
        </Button>
        <p className="plugin-demo-cta-hint">{t('settings.plugins.demo.ctaHint')}</p>
      </div>
    </section>
  )
}
