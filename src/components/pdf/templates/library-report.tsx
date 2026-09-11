import { Heading } from '@/components/pdf/heading/heading'
import { KeyValue } from '@/components/pdf/key-value/key-value'
import { PageFooter } from '@/components/pdf/page-footer/page-footer'
import { PageHeader } from '@/components/pdf/page-header/page-header'
import { PdfList } from '@/components/pdf/list/list'
import { Section } from '@/components/pdf/section/section'
import { Text } from '@/components/pdf/text/text'
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from '@/components/pdf/table/table'
import { PdfcnThemeProvider, usePdfcnTheme } from '@/components/pdf/theme-provider'
import type { PdfcnTheme } from '@/components/pdf-themes'
import { Document, Page, StyleSheet } from '@/lib/pdf-primitives'

export type LibraryReportPdfData = {
  title: string
  generatedAt: string
  stats: {
    documentCount: number
    taggedCount: number
    topTags: { label: string; count: number }[]
    topTerms: { label: string; count: number }[]
    languages: { label: string; count: number }[]
    sentiments: { label: string; count: number }[]
    highlights: string[]
  }
  footerNote?: string
}

const ReportContent = ({ data }: { data: LibraryReportPdfData }) => {
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
    body: {
      color: theme.colors.foreground,
      fontSize: theme.typography.body.fontSize,
      lineHeight: theme.typography.body.lineHeight,
      marginBottom: theme.spacing.paragraphGap,
    },
  })

  const untagged = Math.max(0, data.stats.documentCount - data.stats.taggedCount)

  return (
    <Document title={data.title}>
      <Page size="A4" style={styles.page}>
        <PageHeader
          variant="minimal"
          title={data.title}
          subtitle={data.generatedAt}
          marginBottom={theme.spacing.sectionGap}
        />

        <Section spacing="md">
          <Heading level={3}>Overview</Heading>
          <KeyValue
            items={[
              { key: 'Documents', value: String(data.stats.documentCount) },
              { key: 'Tagged', value: String(data.stats.taggedCount) },
              { key: 'Untagged', value: String(untagged) },
            ]}
          />
        </Section>

        {data.stats.highlights.length > 0 && (
          <Section spacing="md">
            <Heading level={3}>Highlights</Heading>
            <PdfList
              variant="bullet"
              items={data.stats.highlights.map((text) => ({ text }))}
            />
          </Section>
        )}

        {data.stats.topTags.length > 0 && (
          <Section spacing="md">
            <Heading level={3}>Top tags</Heading>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableCell header>Tag</TableCell>
                  <TableCell header>Count</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.stats.topTags.slice(0, 10).map((row) => (
                  <TableRow key={row.label}>
                    <TableCell>{row.label}</TableCell>
                    <TableCell>{String(row.count)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Section>
        )}

        {data.stats.languages.length > 0 && (
          <Section spacing="md">
            <Heading level={3}>Languages</Heading>
            <PdfList
              variant="bullet"
              items={data.stats.languages.map((row) => ({
                text: `${row.label} (${row.count})`,
              }))}
            />
          </Section>
        )}

        {data.stats.sentiments.length > 0 && (
          <Section spacing="md">
            <Heading level={3}>Tone sample</Heading>
            <PdfList
              variant="bullet"
              items={data.stats.sentiments.map((row) => ({
                text: `${row.label} (${row.count})`,
              }))}
            />
          </Section>
        )}

        {data.stats.topTerms.length > 0 && (
          <Section spacing="md">
            <Heading level={3}>Frequent terms</Heading>
            <Text style={styles.body}>
              {data.stats.topTerms
                .slice(0, 12)
                .map((row) => `${row.label} (${row.count})`)
                .join(' · ')}
            </Text>
          </Section>
        )}

        <PageFooter
          leftText={data.footerNote ?? 'Scribe · Library report'}
          rightText={data.generatedAt}
          sticky
          pagePadding={25}
        />
      </Page>
    </Document>
  )
}

export function LibraryReportDocument({
  data,
  theme,
}: {
  data: LibraryReportPdfData
  theme?: PdfcnTheme
}) {
  return (
    <PdfcnThemeProvider theme={theme}>
      <ReportContent data={data} />
    </PdfcnThemeProvider>
  )
}
