import { Heading } from '@/components/pdf/heading/heading'
import { PageFooter } from '@/components/pdf/page-footer/page-footer'
import { PageHeader } from '@/components/pdf/page-header/page-header'
import { PdfList } from '@/components/pdf/list/list'
import { Section } from '@/components/pdf/section/section'
import { Text } from '@/components/pdf/text/text'
import { PdfcnThemeProvider, usePdfcnTheme } from '@/components/pdf/theme-provider'
import type { PdfcnTheme } from '@/components/pdf-themes'
import { Document, Page, StyleSheet, View } from '@/lib/pdf-primitives'

export type JournalDigestPdfData = {
  title: string
  weekLabel: string
  period: string
  summary: string
  bullets: string[]
  tasks: string[]
  toneLabel?: string | null
  documentCount: number
  footerNote?: string
}

const DigestContent = ({ data }: { data: JournalDigestPdfData }) => {
  const theme = usePdfcnTheme()
  const styles = StyleSheet.create({
    page: {
      backgroundColor: theme.colors.background,
      boxSizing: 'border-box',
      minHeight: 841,
      padding: theme.spacing.page.marginTop,
      paddingBottom: theme.spacing.page.marginBottom,
      position: 'relative',
    },
    meta: {
      color: theme.colors.mutedForeground,
      fontSize: 10,
      marginBottom: theme.spacing.sectionGap,
    },
    body: {
      color: theme.colors.foreground,
      fontSize: theme.typography.body.fontSize,
      lineHeight: theme.typography.body.lineHeight,
      marginBottom: theme.spacing.paragraphGap,
    },
  })

  return (
    <Document title={data.title}>
      <Page size="A4" style={styles.page}>
        <PageHeader
          variant="minimal"
          title={data.title}
          subtitle={data.weekLabel}
          marginBottom={theme.spacing.componentGap}
        />
        <Text style={styles.meta}>
          {data.period}
          {data.documentCount > 0 ? `  ·  ${data.documentCount} notes` : ''}
          {data.toneLabel ? `  ·  ${data.toneLabel}` : ''}
        </Text>

        <Section spacing="md">
          <Heading level={3}>Summary</Heading>
          <Text style={styles.body}>{data.summary}</Text>
        </Section>

        {data.bullets.length > 0 && (
          <Section spacing="md">
            <Heading level={3}>Highlights</Heading>
            <PdfList
              variant="bullet"
              items={data.bullets.map((text) => ({ text }))}
            />
          </Section>
        )}

        <Section spacing="md">
          <Heading level={3}>Open tasks</Heading>
          {data.tasks.length > 0 ? (
            <PdfList
              variant="checklist"
              items={data.tasks.map((text) => ({ text, checked: false }))}
            />
          ) : (
            <Text style={styles.body}>No open tasks.</Text>
          )}
        </Section>

        <View style={{ flexGrow: 1 }} />
        <PageFooter
          leftText={data.footerNote ?? 'Scribe · Journal digest'}
          rightText={data.period}
          sticky
          pagePadding={25}
        />
      </Page>
    </Document>
  )
}

export function JournalDigestDocument({
  data,
  theme,
}: {
  data: JournalDigestPdfData
  theme?: PdfcnTheme
}) {
  return (
    <PdfcnThemeProvider theme={theme}>
      <DigestContent data={data} />
    </PdfcnThemeProvider>
  )
}
