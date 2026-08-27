import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/Button/Button';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import {
  Upload, Search, FileCheck, Shield, Zap, AlertTriangle,
  ChevronRight, Lock, Eye, Brain, CheckCircle, HelpCircle,
  ArrowRight, Star, Users, Building2
} from 'lucide-react';
import { AnimatedHeadline } from '@/components/ui/AnimatedHeadline';
import { AnimatedStagger } from '@/components/ui/AnimatedStagger';
import { SmoothScrollLink } from '@/components/ui/SmoothScrollLink';
import { HeroCarousel } from '@/components/ui/HeroCarousel';
import { BrandLogo } from '@/components/brand/BrandLogo';
import styles from './page.module.scss';

export const metadata: Metadata = {
  title: 'Free Policy Coverage Analysis for Homeowners | CoverageCheckNow',
  description: 'Upload your property insurance policy for instant coverage analysis, replacement cost verification, and gap detection. Free, independent, and secure.',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'Free Policy Coverage Analysis for Homeowners | CoverageCheckNow',
    description: 'Upload your property insurance policy for instant coverage analysis, replacement cost verification, and gap detection. Free, independent, and secure.',
    url: '/',
    siteName: 'CoverageCheckNow',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'CoverageCheckNow — Free Policy Coverage Analysis for Homeowners',
      },
    ],
  },
};

// ─── Data ───

const steps = [
  {
    num: '01',
    icon: Upload,
    title: 'Upload Your Dec Page',
    desc: 'Upload your current insurance declarations page as a PDF. It takes less than a minute.',
  },
  {
    num: '02',
    icon: Search,
    title: 'Advanced Coverage Analysis',
    desc: 'Our system cross-references your coverage limits, deductibles, and exclusions against property data, replacement cost estimates, and California-specific risk factors.',
  },
  {
    num: '03',
    icon: FileCheck,
    title: 'Agent-Guided Coverage Review',
    desc: 'Our team cross-references your policy against replacement cost benchmarks and companion coverage to prepare a tailored report for your review.',
  },
];

const deliverables = [
  { icon: AlertTriangle, title: 'Risk Exposure Analysis', desc: 'See exactly where your current policy may leave you underinsured or at risk.' },
  { icon: Zap, title: 'Risk Scoring', desc: 'Understand your risk level across property, liability, and specialty lines.' },
  { icon: CheckCircle, title: 'Coverage Recommendations', desc: 'Actionable suggestions to strengthen your coverage, reduce risk, and protect what matters most.' },
  { icon: FileCheck, title: 'Renewal Confidence Checklist', desc: 'Know what to ask your agent before your next renewal.' },
  { icon: Users, title: 'Agent-Reviewed Options', desc: 'Connect with experienced agents who can implement recommended changes.' },
];

const whyItems = [
  { title: 'Underinsurance surprises', desc: 'Most homeowners don\'t discover gaps until they file a claim. By then, it\'s too late.' },
  { title: 'Natural disaster gaps', desc: 'Flood, earthquake, and wildfire coverage varies widely and is often excluded by default.' },
  { title: 'Liability blind spots', desc: 'Umbrella and liability limits often fall short of actual exposure for families and small businesses.' },
  { title: 'Deductible traps', desc: 'High deductibles on specific perils can mean tens of thousands out of pocket when disaster strikes.' },
];

const dataProviders = [
  { name: 'CoreLogic', desc: 'Property data & risk analytics' },
  { name: 'Verisk', desc: 'Insurance underwriting intelligence' },
  { name: 'EagleView', desc: 'Aerial imagery & measurement' },
  { name: 'Nearmap', desc: 'High-resolution aerial surveys' },
];

const testimonials = [
  {
    name: 'Sarah M.',
    role: 'Homeowner, Santa Barbara',
    quote: 'I had no idea my flood coverage had been dropped after my last renewal. CoverageCheckNow caught it in minutes.',
  },
  {
    name: 'David K.',
    role: 'Small Business Owner',
    quote: 'The coverage report showed my liability limits were half what they should be. My agent confirmed and we fixed it the same week.',
  },
  {
    name: 'Rachel T.',
    role: 'Insurance Agent, LA',
    quote: 'I use CoverageCheckNow for every client onboarding now. It saves hours of manual dec page review and catches things I might miss.',
  },
];

const faqs = [
  { q: 'Is it free?', a: 'Yes. CoverageCheckNow is completely free to use. There are no hidden fees.' },
  { q: 'What do you need from me?', a: 'Just your insurance declarations page — the summary page from your policy documents. It\'s usually 1–3 pages.' },
  { q: 'Do I need an account?', a: 'Yes, a free account is required so your documents and reports stay secure and accessible only to you.' },
  { q: 'How does the review process work?', a: 'Once you upload your declarations page, our team pulls property records, calculates replacement cost estimates, and prepares a comprehensive report for you and your agent to review together.' },
  { q: 'Is my data safe?', a: 'Yes. All data is encrypted in transit (TLS) and at rest. We enforce role-based access control, row-level security, and never sell your personal data.' },
  { q: 'What file types are supported?', a: 'We accept PDF files up to 10MB.' },
  { q: 'Does this replace my agent?', a: 'No. CoverageCheckNow helps you and your agent make more informed decisions. We recommend reviewing results with a licensed professional.' },
  { q: 'What states are supported?', a: 'We are currently focused on California.' },
];

// ─── Page ───

export default function Home() {
  return (
    <div className={styles.page}>
      <Navbar />

      <main>
        {/* ─── HERO: Split layout ─── */}
        <section className={styles.hero}>
          <div className={styles.heroInner}>
            <div className={styles.heroText}>
              <div className={styles.heroBrandLogo}>
                <BrandLogo variant="horizontal" size="lg" mode="dark" />
              </div>
              <div className={styles.heroBadge}>
                <Shield size={14} />
                <span>Powered by Alsop & Associates · 40 years in California</span>
              </div>
              <AnimatedHeadline
                text="Most homes are underinsured. Check your coverage and safeguard your home today."
                className={styles.heroHeadline}
                delayMs={300}
                staggerMs={140}
              />
              <p className={styles.heroSub}>
                Upload your insurance policy and get a personalized coverage report with risk insights and next steps.
              </p>
              <div className={styles.heroCtas}>
                <Link href="/submit">
                  <Button size="lg" className={styles.primaryCta}>
                    Check My Coverage
                    <ArrowRight size={18} />
                  </Button>
                </Link>
                <SmoothScrollLink href="#how-it-works" className={styles.ghostCta}>
                  See how it works
                  <ChevronRight size={16} />
                </SmoothScrollLink>
              </div>
              <AnimatedStagger className={styles.heroProof} delayMs={500} staggerMs={150}>
                <div className={styles.proofItem}>
                  <Lock size={14} />
                  <span>Encrypted & secure</span>
                </div>
                <div className={styles.proofItem}>
                  <Brain size={14} />
                  <span>Reviewed by licensed agents</span>
                </div>
                <div className={styles.proofItem}>
                  <CheckCircle size={14} />
                  <span>Free to use</span>
                </div>
              </AnimatedStagger>
            </div>
            <div className={styles.heroImage}>
              <HeroCarousel />
              <div className={styles.heroImageOverlay} />
            </div>
          </div>
        </section>

        {/* ─── TRUST BAR ─── */}
        <section className={styles.trustBar}>
          <div className={styles.trustBarInner}>
            <div className={styles.trustStat}>
              <strong>40+ Years</strong>
              <span>Backed by Alsop & Associates</span>
            </div>
            <div className={styles.trustDivider} />
            <div className={styles.trustStat}>
              <strong>50+ Risk Checks</strong>
              <span>Per policy analysis</span>
            </div>
            <div className={styles.trustDivider} />
            <div className={styles.trustStat}>
              <strong>California</strong>
              <span>Focused coverage</span>
            </div>
            <div className={styles.trustDivider} />
            <div className={styles.trustStat}>
              <strong>Free</strong>
              <span>No fees</span>
            </div>
          </div>
        </section>

        {/* ─── HOW IT WORKS ─── */}
        <section className={styles.sectionLight} id="how-it-works">
          <div className={styles.contain}>
            <div className={styles.sectionHead}>
              <span className={styles.sectionLabel}>How It Works</span>
              <h2>Three steps for smart coverage.</h2>
              <p>No paperwork. Just upload and go.</p>
            </div>
            <AnimatedStagger className={styles.stepsRow} staggerMs={150}>
              {steps.map((step, i) => (
                <div key={i} className={styles.stepCard}>
                  <div className={styles.stepTop}>
                    <span className={styles.stepNum}>{step.num}</span>
                    <div className={styles.stepIconWrap}>
                      <step.icon size={22} />
                    </div>
                  </div>
                  <h3>{step.title}</h3>
                  <p>{step.desc}</p>
                </div>
              ))}
            </AnimatedStagger>
          </div>
        </section>

        {/* ─── WHAT YOU GET ─── */}
        <section className={styles.sectionDark}>
          <div className={styles.contain}>
            <div className={styles.sectionHead}>
              <span className={styles.sectionLabel}>What You Get</span>
              <h2>A comprehensive analysis — not just a summary.</h2>
              <p>Every report is built to help you and your agent take action.</p>
            </div>

            {/* Featured hero card */}
            <AnimatedStagger className={styles.delivFeatured} staggerMs={0} distance={40}>
              <div className={styles.delivHeroCard}>
                <div className={styles.delivHeroGlow} />
                <div className={styles.delivHeroIconWrap}>
                  <AlertTriangle size={28} />
                </div>
                <div className={styles.delivHeroContent}>
                  <h3>{deliverables[0].title}</h3>
                  <p>{deliverables[0].desc}</p>
                </div>
              </div>
            </AnimatedStagger>

            {/* 2×2 grid for remaining items */}
            <AnimatedStagger className={styles.delivGrid} staggerMs={80} distance={30}>
              {deliverables.slice(1).map((d, i) => (
                <div key={i} className={styles.delivCard}>
                  <div className={styles.delivIconWrap}>
                    <d.icon size={20} />
                  </div>
                  <div>
                    <h3>{d.title}</h3>
                    <p>{d.desc}</p>
                  </div>
                </div>
              ))}
            </AnimatedStagger>
          </div>
        </section>

        {/* ─── WHY IT MATTERS ─── */}
        <section className={styles.sectionLight}>
          <div className={styles.contain}>
            <div className={styles.sectionHead}>
              <span className={styles.sectionLabel}>Why It Matters</span>
              <h2>Most coverage risks are invisible — until it&apos;s too late.</h2>
            </div>
            <AnimatedStagger className={styles.whyGrid} staggerMs={100} distance={30}>
              {whyItems.map((w, i) => (
                <div key={i} className={styles.whyCard}>
                  <AlertTriangle size={20} className={styles.whyIcon} />
                  <div>
                    <h3>{w.title}</h3>
                    <p>{w.desc}</p>
                  </div>
                </div>
              ))}
            </AnimatedStagger>
          </div>
        </section>

        {/* ─── INDUSTRY DATA PARTNERS (hidden: no partners yet) ───
        <section className={styles.sectionDark}>
          <div className={styles.contain}>
            <div className={styles.sectionHead}>
              <span className={styles.sectionLabel}>Industry Data</span>
              <h2>Designed to work with leading data providers.</h2>
              <p>We&apos;re building CoverageCheckNow to integrate with the most trusted sources in insurance intelligence.</p>
            </div>
            <AnimatedStagger className={styles.partnerGrid} staggerMs={120} distance={25}>
              {dataProviders.map((p, i) => (
                <div key={i} className={styles.partnerCard}>
                  <Building2 size={24} className={styles.partnerIcon} />
                  <span className={styles.partnerName}>{p.name}</span>
                  <span className={styles.partnerDesc}>{p.desc}</span>
                </div>
              ))}
            </AnimatedStagger>
            <p className={styles.partnerDisclaimer}>
              Data provider integrations are planned and under development. Names shown represent the data ecosystem CoverageCheckNow is being designed to work with.
            </p>
          </div>
        </section>
        ─── */}

        {/* ─── TESTIMONIALS (hidden: no real testimonials yet) ───
        <section className={styles.sectionLight}>
          <div className={styles.contain}>
            <div className={styles.sectionHead}>
              <span className={styles.sectionLabel}>What Users Are Saying</span>
              <h2>Trusted by homeowners and agents alike.</h2>
            </div>
            <AnimatedStagger className={styles.testGrid} staggerMs={150} distance={30}>
              {testimonials.map((t, i) => (
                <div key={i} className={styles.testCard}>
                  <div className={styles.testStars}>
                    {[...Array(5)].map((_, j) => <Star key={j} size={14} />)}
                  </div>
                  <p className={styles.testQuote}>&ldquo;{t.quote}&rdquo;</p>
                  <div className={styles.testAuthor}>
                    <strong>{t.name}</strong>
                    <span>{t.role}</span>
                  </div>
                </div>
              ))}
            </AnimatedStagger>
            <p className={styles.finePrint}>Sample testimonials shown during beta period.</p>
          </div>
        </section>
        ─── */}

        {/* ─── SECURITY & PRIVACY ─── */}
        <section className={styles.sectionDark}>
          <div className={styles.contain}>
            <div className={styles.sectionHead}>
              <span className={styles.sectionLabel}>Security & Privacy</span>
              <h2>Your data is handled with care.</h2>
            </div>
            <AnimatedStagger className={styles.securityRow} staggerMs={120} distance={25}>
              <div className={styles.securityItem}>
                <Lock size={20} />
                <div>
                  <h4>Encrypted Storage</h4>
                  <p>All documents are encrypted at rest and in transit.</p>
                </div>
              </div>
              <div className={styles.securityItem}>
                <Eye size={20} />
                <div>
                  <h4>Access Controls</h4>
                  <p>Least-privilege access — only you see your data.</p>
                </div>
              </div>
              <div className={styles.securityItem}>
                <Shield size={20} />
                <div>
                  <h4>No Data Sales</h4>
                  <p>We never sell, share, or monetize your personal data.</p>
                </div>
              </div>
              <div className={styles.securityItem}>
                <Brain size={20} />
                <div>
                  <h4>Technology Transparency</h4>
                  <p>Technology is assistive — recommendations should always be reviewed.</p>
                </div>
              </div>
            </AnimatedStagger>
            <p className={styles.legalNote}>
              This tool provides informational guidance and is not legal or financial advice. Recommendations should be reviewed with a licensed insurance professional.
            </p>
          </div>
        </section>

        {/* ─── READY TO CHECK CTA ─── */}
        <section className={styles.finalCta}>
          <div className={styles.contain}>
            <h2>Ready to check your coverage?</h2>
            <p>Upload your policy declarations to start your comprehensive review with a licensed agent. No credit card. No obligation.</p>
            <Link href="/submit">
              <Button size="lg" className={styles.primaryCta}>
                Check My Coverage
                <ArrowRight size={18} />
              </Button>
            </Link>
          </div>
        </section>

        {/* ─── FAQ ─── */}
        <section className={styles.sectionLight}>
          <div className={styles.contain}>
            <div className={styles.sectionHead}>
              <HelpCircle size={20} className={styles.sectionLabelIcon} />
              <span className={styles.sectionLabel}>FAQ</span>
              <h2>Frequently asked questions.</h2>
            </div>
            <AnimatedStagger className={styles.faqList} staggerMs={80} distance={15}>
              {faqs.map((f, i) => (
                <details key={i} className={styles.faqItem}>
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </AnimatedStagger>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
