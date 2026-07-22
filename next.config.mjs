/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // De demo-dataset wordt at runtime met fs gelezen door /api/projects/demo; file tracing
  // ziet zo'n dynamische read niet, dus neem de map expliciet mee in de serverless bundle.
  experimental: {
    outputFileTracingIncludes: {
      "/api/projects/demo": ["./demo_data/mediamarkt_demo_dataset.csv"],
    },
  },
};

export default nextConfig;
