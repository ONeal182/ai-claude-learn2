# Graph Report - monorepo  (2026-09-08)

## Corpus Check
- 401 files · ~279,895 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1838 nodes · 3245 edges · 192 communities (127 shown, 63 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 68 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Skills Ui
- API 
- API 
- Skills Ui
- API 
- Claude Ralph Loop
- Web 
- Skills Ui
- Package Devdependencies
- Skills Ui
- Web 
- Skills Ui
- API 
- Skills Ui
- Turbo Build Dependson
- Skills Ui
- Skills Ui
- API 
- Web 
- Web 
- Skills Skills
- Skills Ui
- Skills Ui
- API 
- Skills Ui
- Scripts Llm Benchmark
- API 
- API 
- Web 
- Web 
- Skills Skills
- API 
- API 
- API 
- API 
- API 
- Web 
- API 
- API 
- API 
- API 
- API 
- API 
- API 
- API 
- API 
- Skills Ui
- Skills Ui
- API 
- API 
- API 
- API 
- Skills Vercel
- API 
- Web 
- API 
- API 
- Skills Ui
- API 
- Web 
- Web 
- Skills Ui
- API 
- API 
- API 
- Skills Ui
- API 
- API 
- API 
- Skills Skills
- Skills Ui
- Skills Vercel
- API 
- API 
- Web 
- Skills Skills
- API 
- API 
- API 
- API 
- API 
- API 
- API 
- Prettierrc Printwidth
-  Claude Agents
- Skills Heroui
- Skills Heroui
- Skills Vercel
- Skills Vercel
- API 
- API 
- API 
- API 
- API 
- API 
- API 
- API 
- Claude Ralph Format
- Skills Skills
- Skills Skills
- Skills Skills
- Skills Heroui
- Skills Heroui
- Skills Heroui
- Skills Heroui
- Skills Ui
- Skills Vercel
- Skills Vercel
- Skills Vercel
- API 
- API 
- API 
- API 
- API 
- API 
- API 
- Mcp Command Npx
- Skills Skills
- Skills Skills
- Skills Skills
- Skills Skills
- Skills Skills
- Skills Skills
- Skills Skills
- Skills Vercel
- Skills Vercel
- Skills Vercel
- Skills Vercel
- API 
- API 
- API 
- Skills Skills
- Skills Skills
- Skills Skills
- Skills Skills
- Skills Skills
- Skills Skills
- Skills Skills
- Skills Skills
- Skills Skills
- Skills Skills
- Skills Skills
- Skills Skills
- Skills Vercel
- Skills Vercel
- Skills Vercel
- Skills Vercel
- Skills Vercel
- Skills Vercel
- Skills Vercel
- Skills Vercel
- Skills Vercel
- Skills Vercel
- Skills Vercel
- Skills Vercel
- Skills Vercel
- Skills Vercel
- Skills Vercel
- Skills Vercel
- Web 
- Web 
- Scripts Test Api
- Skills Skills
- Skills Skills
- Skills Skills
- Skills Skills
- Skills Skills
- Skills Skills
- Skills Skills
- Skills Skills
- Skills Skills
- Skills Skills
- Skills Skills
- Skills Skills
- Skills Skills
- Skills Skills
- Skills Skills
- Skills Skills
- Skills Skills
- Skills Skills
- Skills Vercel
- Skills Vercel
- Skills Vercel
- Skills Vercel
- Skills Vercel
- API 
- API 
- Community 189
- Readme Md
- Test Skill Check

## God Nodes (most connected - your core abstractions)
1. `@nestjs/common` - 70 edges
2. `PrismaService` - 51 edges
3. `search()` - 43 edges
4. `@nestjs/cqrs` - 39 edges
5. `search_stack()` - 35 edges
6. `DesignSystemGenerator` - 35 edges
7. `@prisma/client` - 35 edges
8. `FileStorageService` - 25 edges
9. `ClaudeAgentService` - 21 edges
10. `processMilestone()` - 20 edges

## Surprising Connections (you probably didn't know these)
- `TestReasoningContract` --uses--> `DesignSystemGenerator`  [INFERRED]
  .agents/skills/ui-ux-pro-max/scripts/tests/test_data_contracts.py → .agents/skills/ui-ux-pro-max/scripts/design_system.py
- `Dashboard()` --indirect_call--> `getMeetings()`  [INFERRED]
  apps/web/src/components/dashboard.tsx → apps/web/src/lib/api.ts
- `ProfileEdit()` --indirect_call--> `getMe()`  [INFERRED]
  apps/web/src/components/profile-edit.tsx → apps/web/src/lib/api.ts
- `ProfileView()` --indirect_call--> `getMe()`  [INFERRED]
  apps/web/src/components/profile-view.tsx → apps/web/src/lib/api.ts
- `CI workflow` --uses--> `PostgreSQL`  [EXTRACTED]
  .github/workflows/ci.yml → CLAUDE.md

## Import Cycles
- None detected.

## Communities (192 total, 63 thin omitted)

### Community 0 - "Skills Ui"
Cohesion: 0.07
Nodes (47): Semantic quality contracts for the core UI/UX datasets., read_rows(), TestAccessibilityGuidance, TestChartsTypographyAndIcons, TestCurrentReactGuidance, TestSemanticColors, _catalog_date(), _check_app_interface_contract() (+39 more)

### Community 1 - "API "
Cohesion: 0.09
Nodes (20): attachmentDisposition(), DeleteMeetingFileCommand, ReprocessMeetingFileCommand, ResummarizeMeetingFileCommand, MeetingFileDto, toMeetingFileDto(), MeetingFileController, Controller (+12 more)

### Community 2 - "API "
Cohesion: 0.08
Nodes (22): AuthController, Body, Controller, HttpCode, Post, CommandHandlers, LoginHandler, CommandHandler (+14 more)

### Community 3 - "Skills Ui"
Cohesion: 0.08
Nodes (12): format_markdown(), generate_design_system(), Format design system as markdown., Main entry point for design system generation. Args: query: Search query (e.g.,…, CatalogRefreshTest, Offline contract tests for deterministic upstream catalog refreshes., TestPersistence, Unit tests for metric math and relevance fixture validation. (+4 more)

### Community 4 - "API "
Cohesion: 0.13
Nodes (13): FakePrisma, PrismaService, Injectable, UpsertTaskDto, CommandHandlers, FindUserByAvatarKeyHandler, Injectable, QueryHandler (+5 more)

### Community 5 - "Claude Ralph Loop"
Cohesion: 0.10
Nodes (40): addUsage(), assertBaseBranchPushed(), branchCachePath, branchExists(), cacheBranchName(), cliIds, config, configPath (+32 more)

### Community 6 - "Web "
Cohesion: 0.06
Nodes (35): dependencies, @heroui/react, @heroui/styles, next, react, react-dom, devDependencies, eslint (+27 more)

### Community 7 - "Skills Ui"
Cohesion: 0.10
Nodes (8): Search stack-specific guidelines, search_stack(), Freshness and migration contracts for native, desktop, and 3D stacks., _rows(), TestNativeDesktopStackFreshness, Freshness and generation-isolation contracts for web stack guidance., _rows(), TestWebStackFreshness

### Community 8 - "Package Devdependencies"
Cohesion: 0.07
Nodes (29): devDependencies, husky, prettier, turbo, typescript, engines, node, prettier (+21 more)

### Community 9 - "Skills Ui"
Cohesion: 0.11
Nodes (28): _contains_phrase(), _domain_keywords(), _exact_stack_identifier(), _file_signature(), _get_bm25(), _load_csv(), _load_csv_snapshot(), _load_product_keywords() (+20 more)

### Community 10 - "Web "
Cohesion: 0.09
Nodes (23): ChevronDownIcon(), DownloadIcon(), eyeStroke, MicIcon(), PaperclipIcon(), RotateCcwIcon(), strokeIcon, TrashIcon() (+15 more)

### Community 11 - "Skills Ui"
Cohesion: 0.11
Nodes (8): Resolve a deprecated in-domain alias, or expose a cross-domain redirect., Main search function with auto-domain detection, search(), _style_search_destination(), TestSearchDomains, Regression tests for the public style taxonomy and search contract., read_rows(), TestStyleTaxonomy

### Community 12 - "API "
Cohesion: 0.10
Nodes (13): CreateMeetingFileHandler, CommandHandler, Injectable, CreateMeetingFileCommand, MEETING_FILE_TYPES, UploadMeetingFileDto, UploadedFilePart, MeetingFileProcessingRequestedEvent (+5 more)

### Community 13 - "Skills Ui"
Cohesion: 0.11
Nodes (10): BM25, BM25 ranking algorithm for text search, Lowercase, normalize synonyms, split, remove punctuation, filter stopwords, Build BM25 index from documents, Score all documents against query, All indexed terms, for suggestion/typo-recovery purposes., Stdlib-only regression tests for core.py / design_system.py (unittest, not…, TestBm25CoreBehavior (+2 more)

### Community 14 - "Turbo Build Dependson"
Cohesion: 0.08
Nodes (25): dependsOn, outputs, cache, cache, persistent, globalPassThroughEnv, dependsOn, $schema (+17 more)

### Community 15 - "Skills Ui"
Cohesion: 0.13
Nodes (9): DesignSystemGenerator, Generates design system recommendations from aggregated searches., Load reasoning rules from CSV., Find matching reasoning rule for a category., Apply reasoning rules to search results., Select best matching result based on priority keywords., TestReasoningMatch, The exact reproduction from issue #428. (+1 more)

### Community 16 - "Skills Ui"
Cohesion: 0.12
Nodes (23): ansi_ljust(), _detect_page_type(), format_ascii_box(), format_master_md(), format_page_override_md(), _generate_intelligent_overrides(), hex_to_ansi(), persist_design_system() (+15 more)

### Community 17 - "API "
Cohesion: 0.08
Nodes (23): author, description, prettier, @types/node, typescript, license, name, private (+15 more)

### Community 18 - "Web "
Cohesion: 0.12
Nodes (14): metadata, metadata, CheckIcon(), EyeIcon(), EyeOffIcon(), SparkleIcon(), LoginForm(), handleSubmit() (+6 more)

### Community 19 - "Web "
Cohesion: 0.17
Nodes (22): ApiError, authRequest(), AuthResult, bearerJsonRequest(), bearerRequest(), Credentials, getMeeting(), getMeetingFiles() (+14 more)

### Community 20 - "Skills Skills"
Cohesion: 0.09
Nodes (23): NestJS Best Practices Sections, Use DTOs and Serialization for API Responses, Use Interceptors for Cross-Cutting Concerns, Use Pipes for Input Transformation, Use API Versioning for Breaking Changes, Avoid Circular Dependencies, Organize by Feature Modules, Use Proper Module Sharing Patterns (+15 more)

### Community 21 - "Skills Ui"
Cohesion: 0.15
Nodes (13): _contrast_ratio(), _derive_dark_palette(), _palette_is_dark(), WCAG relative luminance of a #RRGGBB string, or None if unparseable., True when a colors.csv row's Background is a dark surface., WCAG contrast ratio for two hex colors, or None if either is invalid., Keep product brand tokens while deriving accessible dark surfaces., Pick the highest-ranked palette matching the resolved mode. Only the dark case… (+5 more)

### Community 22 - "Skills Ui"
Cohesion: 0.13
Nodes (4): read_rows(), TestGeneratedCatalogContract, TestLandingAndStackContract, TestReasoningContract

### Community 23 - "API "
Cohesion: 0.13
Nodes (10): prisma, ChangePasswordHandler, CommandHandler, Injectable, ChangePasswordCommand, CommandHandler, Injectable, UpdateUserPasswordHandler (+2 more)

### Community 24 - "Skills Ui"
Cohesion: 0.14
Nodes (12): apply_decision_rules(), _object_without_duplicates(), parse_decision_rules(), Return deterministic mutations and an audit trail; never execute data., Closed, non-executable grammar for design-system decision rules., Parse the canonical condition -> action-array representation., _validate_action(), Cross-file semantic contracts for curated design data. (+4 more)

### Community 25 - "Scripts Llm Benchmark"
Cohesion: 0.16
Nodes (19): BenchmarkResult, debug_log(), main(), print_result(), print_summary(), Run benchmark using OpenAI-compatible API format., Process Anthropic-style streaming response., LLM Benchmark - standalone script for measuring LLM API performance. Measures:… (+11 more)

### Community 26 - "API "
Cohesion: 0.18
Nodes (8): ProfileDto, toProfileDto(), GetProfileHandler, Injectable, QueryHandler, GetProfileQuery, UpdateUserAvatarCommand, FindUserByIdQuery

### Community 27 - "API "
Cohesion: 0.10
Nodes (19): compilerOptions, allowSyntheticDefaultImports, declaration, emitDecoratorMetadata, esModuleInterop, experimentalDecorators, incremental, isolatedModules (+11 more)

### Community 28 - "Web "
Cohesion: 0.16
Nodes (13): metadata, Dashboard(), handleLogout(), dateTimeFormatter, ChevronRightIcon(), LogOutIcon(), AuthedResourceState, useAuthedResource() (+5 more)

### Community 29 - "Web "
Cohesion: 0.18
Nodes (15): ACCEPTED_AVATAR_TYPES, AvatarBlock(), handleFileChange(), handleSubmit(), NameBlock(), handleSubmit(), PasswordBlock(), handleSubmit() (+7 more)

### Community 30 - "Skills Skills"
Cohesion: 0.14
Nodes (19): DTO validation pattern, E2E testing pattern, Guard pattern for access control, JWT security pattern, Test mocking pattern, Rate limiting pattern, Testing Module pattern, XSS prevention pattern (+11 more)

### Community 31 - "API "
Cohesion: 0.11
Nodes (19): devDependencies, dotenv, @nestjs/cli, @nestjs/mau, @nestjs/schematics, @nestjs/testing, oxlint, prettier (+11 more)

### Community 32 - "API "
Cohesion: 0.11
Nodes (19): scripts, build, clean, deploy, dev, format, lint, seed (+11 more)

### Community 33 - "API "
Cohesion: 0.16
Nodes (10): AppController, Controller, Get, AppService, Injectable, MeetingFileModule, Module, Module (+2 more)

### Community 34 - "API "
Cohesion: 0.18
Nodes (13): ClaudeAgentModule, Module, ClaudeAgentService, ClaudeAgentRunOptions, ClaudeAgentRunResult, DEFAULT_CLAUDE_AGENT_MODEL, SdkMessage, SdkProgressMessage (+5 more)

### Community 35 - "API "
Cohesion: 0.15
Nodes (8): GetMeetingFileContentHandler, Injectable, QueryHandler, GetAvatarContentHandler, Injectable, QueryHandler, FileStorageService, Injectable

### Community 36 - "Web "
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 37 - "API "
Cohesion: 0.15
Nodes (9): EventHandlers, EventsHandler, Injectable, UserLoggedInHandler, EventsHandler, Injectable, UserRegisteredHandler, UserLoggedInEvent (+1 more)

### Community 38 - "API "
Cohesion: 0.16
Nodes (13): AuthenticatedRequest, ProfileController, Body, Controller, Get, HttpCode, Post, UploadedFile (+5 more)

### Community 39 - "API "
Cohesion: 0.12
Nodes (16): CI workflow, API package documentation, Claude Agent module, Claude Agent module documentation, Meeting file module, Meeting file module documentation, ClaudeSummaryService, Root monorepo documentation (+8 more)

### Community 40 - "API "
Cohesion: 0.12
Nodes (17): dependencies, @anthropic-ai/claude-agent-sdk, bcryptjs, class-transformer, class-validator, @nestjs/common, @nestjs/config, @nestjs/core (+9 more)

### Community 41 - "API "
Cohesion: 0.17
Nodes (10): STT_SERVICE, SttService, StubSttService, Injectable, createMeeting(), E2eSttService, FileInList, futureIso() (+2 more)

### Community 42 - "API "
Cohesion: 0.16
Nodes (11): AuthModule, Module, AVATAR_EXT_TO_MIME, AVATAR_MIME_TO_EXT, CommandHandlers, ProfileModule, Module, QueryHandlers (+3 more)

### Community 43 - "API "
Cohesion: 0.16
Nodes (5): JwtAuthGuard, Injectable, CreateMeetingCommand, MeetingCreatedEvent, ListMeetingsQuery

### Community 44 - "API "
Cohesion: 0.15
Nodes (9): MeetingFileProcessingRequestedHandler, EventsHandler, Injectable, errorMessage(), isRecordNotFound(), MeetingFileProcessingQueue, build(), Inject (+1 more)

### Community 45 - "API "
Cohesion: 0.25
Nodes (11): SttInput, buildFfmpegArgs(), buildWhisperArgs(), needsConversion(), WAV_MIME_TYPES, WhisperArgsInput, resolveTimeoutMs(), build() (+3 more)

### Community 46 - "Skills Ui"
Cohesion: 0.23
Nodes (3): detect_domain(), Auto-detect the most relevant domain from query. Matches are weighted by…, TestDomainDetection

### Community 47 - "Skills Ui"
Cohesion: 0.16
Nodes (8): _filter_anti_patterns_for_mode(), Drop "avoid dark mode" advice once dark mode is the resolved answer., Execute searches across multiple domains., Extract results list from search result dict., Generate complete design system recommendation. variance/motion/density are…, Bucket a 1-10 dial value into its tier config. Returns None if value is None., _resolve_dial(), TestAntiPatternGating

### Community 48 - "API "
Cohesion: 0.18
Nodes (9): ALLOWED_UPLOAD_MIME_TYPES, CommandHandlers, EventHandlers, DEFAULT_SUMMARY_ENGINE, resolveSummaryEngine(), SummaryEngine, QueryHandlers, TaskModule (+1 more)

### Community 49 - "API "
Cohesion: 0.16
Nodes (8): MeetingFileTranscribedHandler, EventsHandler, Injectable, errorMessage(), isRecordNotFound(), MeetingSummaryQueue, Inject, Injectable

### Community 50 - "API "
Cohesion: 0.23
Nodes (8): ClaudeSummaryService, Injectable, MeetingFileSummary, StubSummaryService, SUMMARY_SERVICE, SummaryInput, SummaryService, Injectable

### Community 51 - "API "
Cohesion: 0.15
Nodes (11): ChangePasswordDto, MIN_PASSWORD_LENGTH, IsNotEmpty, IsString, MinLength, MAX_PROFILE_NAME_LENGTH, IsString, UpdateProfileNameDto (+3 more)

### Community 52 - "Skills Vercel"
Cohesion: 0.15
Nodes (14): Cache Repeated Function Calls, Vercel Dashboard Performance Post, Cache Storage API Calls, localStorage, sessionStorage, Storage Event Listener, Build Index Maps for Repeated Lookups, Map Data Structure (+6 more)

### Community 53 - "API "
Cohesion: 0.15
Nodes (10): createMeetingMcpServer(), findTasksTool, loadCreateSdkMcpServer(), meetingTools, updateMeetingTool, upsertTaskTool, TaskService, Injectable (+2 more)

### Community 54 - "Web "
Cohesion: 0.19
Nodes (9): metadata, Avatar(), AvatarProps, initialsFrom(), ArrowLeftIcon(), PencilIcon(), dateFormatter, ProfileView() (+1 more)

### Community 55 - "API "
Cohesion: 0.15
Nodes (9): DeleteMeetingFileHandler, CommandHandler, Injectable, ReprocessMeetingFileHandler, CommandHandler, Injectable, ResummarizeMeetingFileHandler, CommandHandler (+1 more)

### Community 56 - "API "
Cohesion: 0.18
Nodes (8): DEFAULT_KILL_GRACE_MS, PROCESS_RUNNER, ProcessRunner, ProcessRunOptions, ProcessRunResult, SpawnProcessRunner, Injectable, Inject

### Community 57 - "Skills Ui"
Cohesion: 0.21
Nodes (7): _query_wants_dark(), True when a styles.csv row describes itself as dark-first., True when the query explicitly asks for a dark theme., Resolve the mode the rest of the output has to agree with., _resolve_color_mode(), _style_is_dark_primary(), TestModeResolution

### Community 58 - "API "
Cohesion: 0.21
Nodes (6): AvatarController, Controller, Get, Param, AvatarContent, GetAvatarContentQuery

### Community 59 - "Web "
Cohesion: 0.17
Nodes (7): nextConfig, geistMono, geistSans, metadata, metadata, ProfileEdit(), next

### Community 60 - "Web "
Cohesion: 0.29
Nodes (12): FileRow(), handleDelete(), handleDownload(), handleReprocess(), handleResummarize(), runRowAction(), formatSize(), deleteMeetingFile() (+4 more)

### Community 61 - "Skills Ui"
Cohesion: 0.20
Nodes (4): Canonical regression contracts for resilient UI text layouts., read_rows(), TestTextLayoutDataContracts, TestTextLayoutRetrieval

### Community 62 - "API "
Cohesion: 0.24
Nodes (5): AppModule, Module, createMeeting(), futureIso(), supertest

### Community 63 - "API "
Cohesion: 0.24
Nodes (8): createMeeting(), FileInList, futureIso(), getFile(), listFiles(), MeetingSummary, waitForSummaryStatus(), waitForTranscriptDone()

### Community 64 - "API "
Cohesion: 0.27
Nodes (4): ClaudeAgentError, ClaudeAgentService, loadClaudeAgentQuery(), Injectable

### Community 65 - "Skills Ui"
Cohesion: 0.25
Nodes (9): _exact_match_diagnostic(), _legacy_successor_guidance(), _normalize(), Apply longest-first synonym substitution at token boundaries., Whether a stack query explicitly targets an older framework generation., Choose one coherent applicability generation for stack retrieval., Prefer the explicit successor row for a brand-new app on legacy-only stacks., _stack_query_requests_legacy() (+1 more)

### Community 66 - "API "
Cohesion: 0.36
Nodes (5): validateEnv(), DEFAULT_STT_ENGINE, resolveSttEngine(), STT_ENGINES, SttEngine

### Community 67 - "API "
Cohesion: 0.31
Nodes (5): CommandHandlers, EventHandlers, MeetingModule, Module, QueryHandlers

### Community 68 - "API "
Cohesion: 0.39
Nodes (3): UploadAvatarCommand, UploadedAvatarPart, UpdateUserProfileCommand

### Community 69 - "Skills Skills"
Cohesion: 0.25
Nodes (8): Narrow effect dependencies, useEffect, No effect for derived state, Event handler logic, useMemo, useMemo overhead, Split hook computations, useDeferredValue

### Community 70 - "Skills Ui"
Cohesion: 0.25
Nodes (8): _exact_row_identity(), Suggest complete public identities so a retry can bypass score thresholds., Return non-empty public identities from ordinary and alias fields., Resolve an explicit style identity without opening generic variant ranking., Return one row whose stable public identity exactly matches the query., _row_identities(), _style_identity(), _suggest_identities()

### Community 71 - "Skills Vercel"
Cohesion: 0.43
Nodes (8): preconnect, prefetchDNS, preinit, preinitModule, preload, preloadModule, React DOM, Use React DOM Resource Hints

### Community 72 - "API "
Cohesion: 0.25
Nodes (6): adapter, prisma, pool, dotenv, pg, @prisma/adapter-pg

### Community 73 - "API "
Cohesion: 0.29
Nodes (5): MeetingController, Controller, Get, Param, UseGuards

### Community 74 - "Web "
Cohesion: 0.29
Nodes (4): metadata, CalendarIcon(), dateTimeFormatter, MeetingDetails()

### Community 75 - "Skills Skills"
Cohesion: 0.29
Nodes (7): React.cache() deduplication pattern, Avoid duplicate RSC serialization, Avoid shared module state for request data, Parallel data fetching with component composition, Parallel nested data fetching, Minimize serialization at RSC boundaries, React Server Components

### Community 76 - "API "
Cohesion: 0.29
Nodes (6): env, node, rules, @typescript-eslint/no-explicit-any, @typescript-eslint/no-floating-promises, $schema

### Community 77 - "API "
Cohesion: 0.29
Nodes (5): LoginDto, IsEmail, IsString, MinLength, class-validator

### Community 78 - "API "
Cohesion: 0.29
Nodes (6): CreateMeetingDto, IsNotEmpty, IsString, Body, Post, IsDateString

### Community 80 - "API "
Cohesion: 0.29
Nodes (3): JPEG_BYTES, PNG_BYTES, WEBP_BYTES

### Community 81 - "API "
Cohesion: 0.29
Nodes (6): compilerOptions, rootDir, exclude, extends, include, ./tsconfig.json

### Community 82 - "API "
Cohesion: 0.33
Nodes (5): collection, compilerOptions, deleteOutDir, $schema, sourceRoot

### Community 83 - "Prettierrc Printwidth"
Cohesion: 0.33
Nodes (5): printWidth, semi, singleQuote, tabWidth, trailingComma

### Community 84 - " Claude Agents"
Cohesion: 0.40
Nodes (5): Performance reviewer agent, Security reviewer agent, Test coverage reviewer agent, Ralph loop autonomous workflow rules, Review-all skill

### Community 85 - "Skills Heroui"
Cohesion: 0.70
Nodes (4): fetchApi(), fetchFallback(), main(), toKebabCase()

### Community 86 - "Skills Heroui"
Cohesion: 0.60
Nodes (4): FALLBACK_THEME, fetchApi(), formatVariables(), main()

### Community 87 - "Skills Vercel"
Cohesion: 0.40
Nodes (5): Refs, useEffectEvent, useRef, Stable Callback Refs, useEffectEvent for Callbacks

### Community 88 - "Skills Vercel"
Cohesion: 0.40
Nodes (5): better-all, better-all Library, Dependency Graph Parallelization, Promise.all Parallelization, Sequential Execution Antipattern

### Community 89 - "API "
Cohesion: 0.40
Nodes (4): RegisterDto, IsEmail, IsString, MinLength

### Community 90 - "API "
Cohesion: 0.40
Nodes (3): GetMeetingByIdHandler, Injectable, QueryHandler

### Community 91 - "API "
Cohesion: 0.40
Nodes (3): ListMeetingsHandler, Injectable, QueryHandler

### Community 92 - "API "
Cohesion: 0.40
Nodes (3): CreateUserHandler, CommandHandler, Injectable

### Community 93 - "API "
Cohesion: 0.40
Nodes (3): CommandHandler, Injectable, UpdateUserAvatarHandler

### Community 94 - "API "
Cohesion: 0.40
Nodes (3): CommandHandler, Injectable, UpdateUserProfileHandler

### Community 95 - "API "
Cohesion: 0.40
Nodes (3): FindUserByEmailHandler, Injectable, QueryHandler

### Community 96 - "API "
Cohesion: 0.40
Nodes (3): FindUserByIdHandler, Injectable, QueryHandler

### Community 97 - "Claude Ralph Format"
Cohesion: 0.40
Nodes (3): fs, readline, rl

### Community 98 - "Skills Skills"
Cohesion: 0.67
Nodes (4): Code Review Skill, Fowler Code Smells, Spec Review, Standards Review

### Community 99 - "Skills Skills"
Cohesion: 0.50
Nodes (4): HeroUI v3 React Development Guide, HeroUI v3, React Aria Components, Tailwind CSS v4

### Community 100 - "Skills Skills"
Cohesion: 0.50
Nodes (4): isPending state, Manual loading state, useTransition, startTransition

### Community 101 - "Skills Heroui"
Cohesion: 0.83
Nodes (3): fetchApi(), fetchFallback(), main()

### Community 102 - "Skills Heroui"
Cohesion: 0.83
Nodes (3): fetchApi(), fetchGithubFallback(), main()

### Community 103 - "Skills Heroui"
Cohesion: 0.83
Nodes (3): fetchApi(), fetchGithubFallback(), main()

### Community 104 - "Skills Heroui"
Cohesion: 0.83
Nodes (3): fetchApi(), fetchFallback(), main()

### Community 105 - "Skills Ui"
Cohesion: 0.50
Nodes (3): format_output(), UI/UX Pro Max Search - BM25 search engine for UI/UX style guides Usage: python…, Format results for Claude consumption (token-optimized)

### Community 106 - "Skills Vercel"
Cohesion: 0.67
Nodes (4): Defer Await Pattern, Guard Condition Optimization, Conditional Await, Early Return Optimization

### Community 107 - "Skills Vercel"
Cohesion: 0.50
Nodes (4): Dynamic Import for Third-Party, next/dynamic, Code Splitting, next/dynamic Lazy Loading

### Community 108 - "Skills Vercel"
Cohesion: 0.50
Nodes (4): Event Listener Deduplication, useSWRSubscription, Request Deduplication, SWR

### Community 109 - "API "
Cohesion: 0.67
Nodes (3): fileSize(), main(), modelPath

### Community 110 - "API "
Cohesion: 0.50
Nodes (4): Meeting tools MCP server documentation, MCP server for meeting tools, PrismaService, TaskService

### Community 111 - "API "
Cohesion: 0.50
Nodes (3): CreateMeetingHandler, CommandHandler, Injectable

### Community 112 - "API "
Cohesion: 0.50
Nodes (3): MeetingCreatedHandler, EventsHandler, Injectable

### Community 114 - "API "
Cohesion: 0.50
Nodes (3): ListMeetingFilesHandler, Injectable, QueryHandler

### Community 115 - "API "
Cohesion: 0.50
Nodes (3): CommandHandler, Injectable, UploadAvatarHandler

### Community 116 - "Mcp Command Npx"
Cohesion: 0.50
Nodes (3): npx, playwright, @playwright/mcp

### Community 117 - "Skills Skills"
Cohesion: 0.67
Nodes (3): Git Commit Skill, Conventional Commits, GitHub Issues Generator

### Community 118 - "Skills Skills"
Cohesion: 0.67
Nodes (3): plan-phase skill, prd skill, research skill

### Community 119 - "Skills Skills"
Cohesion: 0.67
Nodes (3): UI/UX workflow, Common Rules for Professional UI, UI/UX Quick Reference

### Community 120 - "Skills Skills"
Cohesion: 0.67
Nodes (3): Vercel React best practices for agents, React Best Practices README, vercel-react-best-practices skill

### Community 121 - "Skills Skills"
Cohesion: 0.67
Nodes (3): Next.js Script component, Script async attribute, Script defer attribute

### Community 122 - "Skills Skills"
Cohesion: 0.67
Nodes (3): Functional setState updates, Stale closure, useCallback

### Community 123 - "Skills Skills"
Cohesion: 0.67
Nodes (3): LRU Cache, React.cache, Vercel Fluid Compute

### Community 124 - "Skills Vercel"
Cohesion: 0.67
Nodes (3): Dependency Array, useEffect, useEffectEvent

### Community 125 - "Skills Vercel"
Cohesion: 0.67
Nodes (3): Streaming SSR, Suspense Boundaries, use Hook

### Community 126 - "Skills Vercel"
Cohesion: 0.67
Nodes (3): Barrel Files, optimizePackageImports, Tree Shaking

### Community 127 - "Skills Vercel"
Cohesion: 0.67
Nodes (3): Hoist RegExp Creation, RegExp Global Mutable State, useMemo

### Community 129 - "API "
Cohesion: 0.67
Nodes (3): PrismaModule, Module, Global

## Knowledge Gaps
- **447 isolated node(s):** `FALLBACK_THEME`, `readline`, `fs`, `rl`, `{ execSync }` (+442 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 810 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **63 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `@nestjs/common` connect `API ` to `API `, `API `, `API `, `API `, `API `, `API `, `API `, `API `, `API `, `API `, `API `, `API `, `API `, `API `, `API `, `API `, `API `, `API `, `API `, `API `, `API `, `API `, `API `, `API `, `API `, `API `?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **Why does `PrismaService` connect `API ` to `API `, `API `, `API `, `API `, `API `, `API `, `API `, `API `, `API `, `API `, `API `, `API `, `API `, `API `, `API `, `API `, `API `, `API `, `API `, `API `?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Why does `ClaudeAgentService` connect `API ` to `API `, `API `, `API `, `API `, `API `?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **What connects `FALLBACK_THEME`, `readline`, `fs` to the rest of the system?**
  _447 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Skills Ui` be split into smaller, more focused modules?**
  _Cohesion score 0.07401129943502825 - nodes in this community are weakly interconnected._
- **Should `API ` be split into smaller, more focused modules?**
  _Cohesion score 0.08928571428571429 - nodes in this community are weakly interconnected._
- **Should `API ` be split into smaller, more focused modules?**
  _Cohesion score 0.08405797101449275 - nodes in this community are weakly interconnected._