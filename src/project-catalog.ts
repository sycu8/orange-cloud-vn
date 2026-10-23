/** Shared identity for JSON-LD across Orange Cloud properties. */
export const PERSON_ID = "https://orangecloud.vn/#person";

/**
 * Profiles that already appear on this repo or on orangecloud.vn properties.
 * Do not add a URL that is not published there.
 */
export const PERSON_SAME_AS = [
  "https://github.com/sycu8",
  "https://www.linkedin.com/in/sycule/",
  "https://www.facebook.com/sycule/",
  "https://buymeacoffee.com/sycule",
] as const;

export type ProjectLink = {
  href: string;
  labelVi: string;
  labelEn: string;
};

export type ProjectPage = {
  slug: string;
  /** Homepage dossier id. */
  anchor: string;
  nameVi: string;
  nameEn: string;
  ledeVi: string;
  ledeEn: string;
  bodyVi: string;
  bodyEn: string;
  noteVi: string;
  noteEn: string;
  /** Omit for FireTrace: the wildfire repo stays unlinked. */
  github?: string;
  links: readonly ProjectLink[];
};

export const PROJECT_PAGES: readonly ProjectPage[] = [
  {
    slug: "edge-coverage",
    anchor: "edge",
    nameVi: "Kiểm tra phủ edge",
    nameEn: "Edge coverage check",
    ledeVi: "Bản ghi DNS, đối chiếu resolver, quét subdomain và CDN trên trang.",
    ledeEn: "DNS records, resolver comparison, subdomain scan, and the CDN used on the page.",
    bodyVi:
      "Trang hiện bản ghi DNS, đối chiếu resolver công khai, quét tên từ Certificate Transparency, rồi gọi tên CDN bằng CNAME, header và ASN. Ghi chú chỉ mang tính tham khảo.",
    bodyEn:
      "The page shows DNS records, compares public resolvers, scans Certificate Transparency names, and names the CDN from CNAME, headers, and ASN. The notes are informational.",
    noteVi:
      "Dự án cá nhân. Đây không phải ấn phẩm của Cloudflare, Inc. Không liên kết với Cloudflare, Inc.",
    noteEn:
      "A personal project. This is not a publication of Cloudflare, Inc. Not affiliated with Cloudflare, Inc.",
    github: "https://github.com/sycu8/orange-cloud-vn",
    links: [
      { href: "https://lookup.orangecloud.vn/", labelVi: "Mở lookup.orangecloud.vn", labelEn: "Open lookup.orangecloud.vn" },
      { href: "/tools/edge-coverage/", labelVi: "Mở trang kiểm tra", labelEn: "Open the check" },
    ],
  },
  {
    slug: "onboarding",
    anchor: "onboarding",
    nameVi: "Cloudflare Onboarding Journey",
    nameEn: "Cloudflare Onboarding Journey",
    ledeVi: "Hub học ba ngôn ngữ về Application Services, Developer Platform và Cloudflare One.",
    ledeEn: "A three-language learning hub for Application Services, the Developer Platform, and Cloudflare One.",
    bodyVi:
      "Trang giúp người mới bắt đầu với Cloudflare. Có bản xem trước tutorial trên hub trước khi mở tài liệu gốc. Giao diện ưu tiên tiếng Việt, có tiếng Anh và tiếng Khmer.",
    bodyEn:
      "The site helps beginners get started with Cloudflare. Tutorial previews sit on the hub before the official docs. The UI is Vietnamese-first, with English and Khmer.",
    noteVi: "Nội dung tutorial gốc giữ tiếng Anh. Giấy phép MIT.",
    noteEn: "Original tutorial bodies remain in English. MIT license.",
    github: "https://github.com/sycu8/cloudflare-onboarding-journey",
    links: [
      { href: "https://onboarding.orangecloud.vn/", labelVi: "Mở trang", labelEn: "Open site" },
    ],
  },
  {
    slug: "cf-ready",
    anchor: "ready",
    nameVi: "CF Ready",
    nameEn: "CF Ready",
    ledeVi: "Kiểm tra sẵn sàng trước khi deploy lên Cloudflare: migration, bảo mật, SEO, AI và smoke test.",
    ledeEn: "Checks go-live readiness for Cloudflare: migration, security, SEO, AI, and smoke tests.",
    bodyVi:
      "cf-ready quét repository và tạo báo cáo trên sáu mặt. Mặc định chỉ đọc. Chỉ sửa file khi được gọi lệnh fix an toàn như robots.txt hoặc llms.txt.",
    bodyEn:
      "cf-ready scans a repository and writes a six-area report. Default mode is read-only. It only writes files when you run a safe fix such as robots.txt or llms.txt.",
    noteVi: "Công cụ cộng đồng. Không liên kết với Cloudflare, Inc. Giấy phép MIT.",
    noteEn: "A community tool. Not affiliated with Cloudflare, Inc. MIT license.",
    github: "https://github.com/sycu8/Cloudflare-Go-Live-Readiness",
    links: [
      { href: "https://ready.orangecloud.vn/", labelVi: "Mở trang", labelEn: "Open site" },
    ],
  },
  {
    slug: "case-helper",
    anchor: "case",
    nameVi: "Support Case Helper",
    nameEn: "Support Case Helper",
    ledeVi: "Thu thập bằng chứng và soạn case hỗ trợ Cloudflare. Kèm MCP server chỉ đọc.",
    ledeEn: "Collects evidence and drafts a Cloudflare support case. Includes a read-only MCP server.",
    bodyVi:
      "Ứng dụng đọc mô tả lỗi hoặc ảnh chụp, nhận Ray ID, hostname và mốc UTC, rồi hướng dẫn thu thập bằng chứng. Token khách chỉ nằm trong bộ nhớ phiên.",
    bodyEn:
      "The app reads an error description or screenshot, finds Ray IDs, hostnames, and UTC times, then guides evidence collection. Customer tokens stay in session memory.",
    noteVi: "Kết quả là giả thuyết xử lý sự cố, không phải kết luận nguyên nhân. Không dùng Global API Key.",
    noteEn: "Results are troubleshooting hypotheses, not confirmed root causes. Do not use a Global API Key.",
    github: "https://github.com/sycu8/Cloudflare-Case-Helpr",
    links: [],
  },
  {
    slug: "one-man-company",
    anchor: "omc",
    nameVi: "One Man Company",
    nameEn: "One Man Company",
    ledeVi: "Từ ý tưởng founder tới artifact và bản deploy Worker, với các agent hỗ trợ lập kế hoạch.",
    ledeEn: "From a founder idea to artifacts and a Worker deploy, with agents that help plan the work.",
    bodyVi:
      "Founder mô tả ý tưởng. Các agent lập kế hoạch và viết artifact Markdown. Mỗi company là một thư mục riêng trên R2.",
    bodyEn:
      "A founder describes an idea. Agents plan and write Markdown artifacts. Each company has its own folder on R2.",
    noteVi: "Thí nghiệm điều phối. Không phải sản phẩm của Cloudflare.",
    noteEn: "A coordination experiment. Not a Cloudflare product.",
    github: "https://github.com/sycu8/Orange-Cloud-One-Man-Company",
    links: [],
  },
  {
    slug: "oclaunch",
    anchor: "launch",
    nameVi: "OCLaunch",
    nameEn: "OCLaunch",
    ledeVi: "Thu thập phản hồi sản phẩm, duyệt cải tiến và theo dõi bản phát hành.",
    ledeEn: "Collects product feedback, reviews improvements, and tracks releases.",
    bodyVi: "Control plane cho founder làm việc một mình. Đăng nhập bằng passkey. D1 lưu dữ liệu. R2 riêng lưu artifact.",
    bodyEn: "A control plane for a solo founder. Passkeys for sign-in. D1 for data. Private R2 for artifacts.",
    noteVi: "MVP đã có Browser Run snapshots. Một số tích hợp cần credential của chủ repo.",
    noteEn: "Browser Run snapshots are on in the MVP. Some integrations need the owner's credentials.",
    github: "https://github.com/sycu8/Orange-Cloud-Launch",
    links: [
      { href: "https://launch.orangecloud.vn/", labelVi: "Mở trang", labelEn: "Open site" },
    ],
  },
  {
    slug: "hr-platform",
    anchor: "hr",
    nameVi: "HR Management Platform",
    nameEn: "HR Management Platform",
    ledeVi: "Cổng nhân sự tiếng Việt: nghỉ phép, công tác, lương, tuyển dụng, OKR và đào tạo.",
    ledeEn: "A Vietnamese HR portal for leave, travel, payroll, hiring, OKRs, and training.",
    bodyVi: "Mười module nghiệp vụ cho doanh nghiệp Việt Nam, đơn vị VND. Phân quyền theo vai trò. Tệp phiếu lương lưu trên R2.",
    bodyEn: "Ten business modules for Vietnamese companies, in VND. Role-based access. Payslip files are stored on R2.",
    noteVi: "Phần mềm mẫu. Không thay tư vấn luật lao động hay kế toán.",
    noteEn: "Sample HR software. Not a substitute for labor-law or accounting advice.",
    github: "https://github.com/sycu8/hr-management-platform",
    links: [
      { href: "https://hrm.orangecloud.vn/", labelVi: "Mở trang", labelEn: "Open site" },
    ],
  },
  {
    slug: "bhxh",
    anchor: "bhxh",
    nameVi: "BHXH HR Assistant",
    nameEn: "BHXH HR Assistant",
    ledeVi: "Cổng HR self-service và tra cứu BHXH, BHYT, BHTN có trích nguồn.",
    ledeEn: "Employee HR self-service plus a cited desk for social, health, and unemployment insurance.",
    bodyVi:
      "Nhân viên đăng nhập OTP để xem hồ sơ, nghỉ phép, phiếu lương, giấy tờ và ticket. Bàn tra cứu công khai trả lời kèm nguồn và mức tin cậy.",
    bodyEn:
      "Staff sign in with a one-time code for profile, leave, payslips, documents, and tickets. The public desk answers with sources and a confidence level.",
    noteVi: "Công cụ tra cứu và học. Không phải cổng của cơ quan bảo hiểm và không phải quyết định hưởng chế độ.",
    noteEn: "An educational lookup. Not an official social-insurance portal and not a benefits decision.",
    github: "https://github.com/sycu8/bhxh-hr-assistant",
    links: [
      { href: "https://bhxh.orangecloud.vn/", labelVi: "Mở trang", labelEn: "Open site" },
    ],
  },
  {
    slug: "pulsewatch",
    anchor: "pulse",
    nameVi: "PulseWatch",
    nameEn: "PulseWatch",
    ledeVi: "Theo dõi mention công khai về tên, thương hiệu hoặc sản phẩm.",
    ledeEn: "Monitors public mentions of a person, brand, or product.",
    bodyVi:
      "Hệ thống đa tenant: workspace, monitor, truy vấn Boolean, discovery, crawl và phân loại cảm xúc bằng Workers AI. Đang chạy tại reputation.orangecloud.vn.",
    bodyEn:
      "A multi-tenant system: workspace, monitor, Boolean query, discovery, crawl, and Workers AI sentiment. It runs at reputation.orangecloud.vn.",
    noteVi: "Chỉ nguồn công khai. Không phải công cụ giám sát kín.",
    noteEn: "Public sources only. Not a covert surveillance tool.",
    github: "https://github.com/sycu8/reputation",
    links: [
      { href: "https://reputation.orangecloud.vn/", labelVi: "Mở trang", labelEn: "Open site" },
    ],
  },
  {
    slug: "pitchintel",
    anchor: "pitch",
    nameVi: "PitchIntel",
    nameEn: "PitchIntel",
    ledeVi: "Phân tích chiến thuật và xác suất trận cho World Cup 2026.",
    ledeEn: "Tactical analysis and match probabilities for the 2026 World Cup.",
    bodyVi:
      "Theo dõi lịch trận, đội hình và xác suất trước giờ bóng lăn. Trận đã đá hiển thị xác suất trước trận, không để tỉ số live rò vào mô hình.",
    bodyEn:
      "Tracks the match calendar, lineups, and pre-match probabilities. Completed matches show the pre-match snapshot so live scores do not leak into the model.",
    noteVi: "Mô hình xác suất. Không phải nhà cái và không phải nguồn thống kê chính thức.",
    noteEn: "A probability model. Not a bookmaker and not an official statistics feed.",
    github: "https://github.com/sycu8/world-cup-intelligence",
    links: [
      { href: "https://wcstat.orangecloud.vn/", labelVi: "Mở trang", labelEn: "Open site" },
    ],
  },
  {
    slug: "poker-faces",
    anchor: "poker",
    nameVi: "Poker Faces",
    nameEn: "Poker Faces",
    ledeVi: "Texas Hold’em chip ảo cho bàn riêng với bạn bè.",
    ledeEn: "Private play-money Texas Hold’em for friends.",
    bodyVi: "Mỗi phòng là một Durable Object SQLite với WebSocket. Chủ bàn duyệt người ngồi. Chỉ chip ảo.",
    bodyEn: "Each room is a SQLite Durable Object with WebSockets. The host approves who joins. Virtual chips only.",
    noteVi: "Không nạp tiền, không rút tiền, không ví. Giấy phép MIT.",
    noteEn: "No deposits, cash-out, or wallet. MIT license.",
    github: "https://github.com/sycu8/poker-face",
    links: [
      { href: "https://poker.orangecloud.vn/", labelVi: "Mở trang", labelEn: "Open site" },
    ],
  },
  {
    slug: "vn-market",
    anchor: "market",
    nameVi: "VN Market Daily",
    nameEn: "VN Market Daily",
    ledeVi: "Tin chứng khoán Việt Nam, làm mới mỗi năm phút.",
    ledeEn: "Vietnam market news, refreshed every five minutes.",
    bodyVi:
      "Worker thu thập nguồn RSS và HTML đã duyệt, lưu bài và tin vắn, tóm tắt bằng Workers AI. Trang đang chạy tại stocknews.orangecloud.vn.",
    bodyEn:
      "The Worker collects approved RSS and HTML sources, stores articles and briefs, and summarizes with Workers AI. The site runs at stocknews.orangecloud.vn.",
    noteVi: "Bàn đọc tin. Không phải khuyến nghị đầu tư.",
    noteEn: "A reading desk. Not investment advice.",
    github: "https://github.com/sycu8/stock-news-cloudflare-workers-do-r2",
    links: [
      { href: "https://stocknews.orangecloud.vn/", labelVi: "Mở trang", labelEn: "Open site" },
    ],
  },
  {
    slug: "pregnancy-meal",
    anchor: "meal",
    nameVi: "Pregnancy Meal Planner",
    nameEn: "Pregnancy Meal Planner",
    ledeVi: "Thực đơn Việt 7 ngày cho thai kỳ. Miễn phí. Lưu trên máy người dùng.",
    ledeEn: "A free 7-day Vietnamese pregnancy meal plan. Stored on the user's device.",
    bodyVi:
      "Lập thực đơn nhiều bước, danh sách đi chợ và ghi chú tình trạng thường gặp. Bản tiếng Việt đang chạy tại pregnancymeal.tips/vi. Bản đầu không yêu cầu tài khoản.",
    bodyEn:
      "A multi-step planner with a shopping list and notes for common conditions. The Vietnamese edition runs at pregnancymeal.tips/vi. The first version does not require an account.",
    noteVi: "Chỉ để tham khảo. Không phải tư vấn y tế. Hồ sơ lưu localStorage.",
    noteEn: "For reference only. Not medical advice. Profiles stay in localStorage.",
    github: "https://github.com/sycu8/pregnancy-meal-plan",
    links: [
      { href: "https://pregnancymeal.tips/", labelVi: "Mở trang", labelEn: "Open site" },
      { href: "https://pregnancymeal.tips/vi", labelVi: "Bản tiếng Việt", labelEn: "Vietnamese edition" },
    ],
  },
  {
    slug: "vivaage",
    anchor: "viva",
    nameVi: "VivaAge",
    nameEn: "VivaAge",
    ledeVi: "Hỗ trợ người Việt từ 40 tuổi chuẩn bị sức khỏe, tài chính và kỹ năng chăm sóc.",
    ledeEn: "Helps Vietnamese adults from age 40 prepare for health, money, and care skills.",
    bodyVi:
      "Có bài đánh giá mức sẵn sàng, kế hoạch 30 ngày, thư viện và chatbot trả lời có nguồn. Demo đang chạy tại song-an-40.sycu-lee.workers.dev.",
    bodyEn:
      "Includes a readiness check, a 30-day plan, a library, and a sourced chatbot. The demo runs at song-an-40.sycu-lee.workers.dev.",
    noteVi: "Công cụ giáo dục. Không phải ứng dụng nhà nước, không thay bác sĩ hay tư vấn tài chính.",
    noteEn: "An education tool. Not a government app and not a substitute for a doctor or financial advice.",
    github: "https://github.com/sycu8/live-long-40-",
    links: [
      { href: "https://song-an-40.sycu-lee.workers.dev/", labelVi: "Mở demo", labelEn: "Open demo" },
    ],
  },
  {
    slug: "insights",
    anchor: "insights",
    nameVi: "Orange Cloud Insights",
    nameEn: "Orange Cloud Insights",
    ledeVi: "Repository ghi chú, và trang công khai tại blog.orangecloud.vn.",
    ledeEn: "Notes repository, plus the public site at blog.orangecloud.vn.",
    bodyVi:
      "Repository công khai tạo tháng 6/2026. Trang công khai là blog.orangecloud.vn và vẫn mở cho người đọc.",
    bodyEn:
      "Public repository created in June 2026. The public site is blog.orangecloud.vn and stays open for readers.",
    noteVi: "Repository GitHub chưa chọn stack. Trang công khai là blog.orangecloud.vn.",
    noteEn: "The GitHub repository has no chosen stack yet. The public site is blog.orangecloud.vn.",
    github: "https://github.com/sycu8/Orange-Cloud-Insights",
    links: [
      { href: "https://blog.orangecloud.vn/", labelVi: "Mở trang", labelEn: "Open site" },
    ],
  },
  {
    slug: "firetrace",
    anchor: "firetrace",
    nameVi: "FireTrace",
    nameEn: "FireTrace",
    ledeVi: "Bản đồ điểm nhiệt vệ tinh tại Việt Nam.",
    ledeEn: "A map of satellite hotspots in Vietnam.",
    bodyVi:
      "FireTrace hiện điểm nhiệt vệ tinh trên bản đồ Việt Nam, tại firetrace.orangecloud.vn. Trang này chỉ liên kết tới bản đang chạy.",
    bodyEn:
      "FireTrace shows satellite hotspots on a map of Vietnam, at firetrace.orangecloud.vn. This page links the live site only.",
    noteVi: "Điểm nhiệt không phải đám cháy đã xác nhận.",
    noteEn: "A hotspot is not a confirmed fire.",
    links: [
      { href: "https://firetrace.orangecloud.vn/", labelVi: "Mở trang", labelEn: "Open site" },
    ],
  },
  {
    slug: "ancu",
    anchor: "ancu",
    nameVi: "AnCư 3D",
    nameEn: "AnCư 3D",
    ledeVi: "Hiểu căn nhà trước khi gọi là nhà.",
    ledeEn: "Understand a home before you call it home.",
    bodyVi:
      "AnCư 3D giúp xem mặt bằng, không gian và so sánh theo ưu tiên của người xem, trước khi quyết định. Trang đang chạy tại home.orangecloud.vn. Chỗ chưa rõ thì ghi là chưa rõ.",
    bodyEn:
      "AnCư 3D helps people read floor plans, space, and comparisons against their own priorities before they decide. It runs at home.orangecloud.vn. Unknown stays labeled unknown.",
    noteVi: "Không phải trang rao bán. Không bịa dữ liệu cho đủ.",
    noteEn: "Not a listing portal. It does not invent facts to look complete.",
    github: "https://github.com/sycu8/an-cu-3d",
    links: [
      { href: "https://home.orangecloud.vn/", labelVi: "Mở trang", labelEn: "Open site" },
    ],
  },
];

export function projectPublicPath(slug: string): string {
  return `/projects/${slug}/`;
}
