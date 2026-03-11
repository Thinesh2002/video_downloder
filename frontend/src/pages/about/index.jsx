export default function AboutPage() {
  return (
    <div className="">

      <div className="max-w-8xl mx-auto px-6 py-16 text-slate-700">

        <h1 className="text-4xl font-bold text-slate-900 mb-6">
          About Teckvora Video Downloader
        </h1>

        <p className="mb-6">
          Teckvora Video Downloader is a modern online tool that allows users to
          download videos and images from popular social media platforms quickly
          and easily. Our goal is to provide a simple, fast, and reliable way to
          save online content directly to your device without installing any
          software.
        </p>

        <p className="mb-10">
          With Teckvora Video Downloader, users can download videos from
          Instagram, TikTok, Facebook, YouTube, Twitter (X), Vimeo, Pinterest,
          and Reddit. The tool works directly in your browser and supports
          desktop computers, laptops, tablets, and smartphones including
          Android and iPhone.
        </p>


        {/* MISSION */}
        <h2 className="text-2xl font-semibold text-slate-900 mb-4">
          Our Mission
        </h2>

        <p className="mb-10">
          Our mission is to make video downloading simple, fast, and accessible
          for everyone. We focus on building reliable tools that allow users to
          save online media content in high quality while maintaining a smooth
          and secure user experience.
        </p>


        {/* WHAT WE OFFER */}
        <h2 className="text-2xl font-semibold text-slate-900 mb-4">
          What Teckvora Video Downloader Offers
        </h2>

        <ul className="list-disc pl-6 space-y-2 mb-10">
          <li>Fast video processing and downloading.</li>
          <li>Support for multiple social media platforms.</li>
          <li>High quality video downloads including HD and Full HD.</li>
          <li>No registration or login required.</li>
          <li>Works on all devices including mobile and desktop.</li>
          <li>Simple and easy to use interface.</li>
          <li>Completely web-based tool.</li>
        </ul>


        {/* WHY USE */}
        <h2 className="text-2xl font-semibold text-slate-900 mb-4">
          Why Choose Teckvora
        </h2>

        <p className="mb-6">
          Teckvora focuses on performance, reliability, and simplicity.
          Our downloader is designed to process links quickly while keeping
          the interface clean and easy for users of all experience levels.
        </p>

        <p className="mb-10">
          Unlike many other tools, Teckvora does not require users to install
          extensions, download software, or create accounts. Simply paste the
          video link, fetch the content, and download it instantly.
        </p>


        {/* PRIVACY */}
        <h2 className="text-2xl font-semibold text-slate-900 mb-4">
          Privacy and Security
        </h2>

        <p className="mb-10">
          Teckvora respects user privacy. We do not store downloaded videos,
          user links, or personal information. The platform only processes the
          video link temporarily in order to generate the download file.
        </p>


        {/* DISCLAIMER */}
        <div className="mt-12 text-sm text-slate-500">
          Teckvora Video Downloader is an independent tool and is not
          affiliated with Instagram, TikTok, Facebook, YouTube, Twitter (X),
          Vimeo, Pinterest, Reddit or any other social media platform.
          Users are responsible for ensuring they have the rights to
          download and use the content.
        </div>

      </div>

    </div>
  );
}