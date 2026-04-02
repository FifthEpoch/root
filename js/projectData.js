const R2 = 'https://pub-c13cdb673b934fa282c9bb3c6f22046e.r2.dev/';

const link = (text, url) => ({ text, url });
const section = (heading, text) => ({ heading, text });

export const projects = [
  {
    title: 'writings',
    subtitle:
      'A list of writing projects and essays. Select a title to open the individual page.',
    links: [],
    manifestPath: 'projects/writings/manifest.txt',
    children: [
      {
        title: 'Between Flesh and Code: Free Translation from Biology to Computer Algorithm',
        subtitle: '',
        links: [],
        href: 'https://pub-c13cdb673b934fa282c9bb3c6f22046e.r2.dev/projects/writings/pdf/WunTingChan-TTT-2025-IU-pf-03629-91428-en.pdf',
        sections: [],
      },
      {
        title: 'All the Lights are Upside Down',
        subtitle: '',
        links: [],
        href: 'https://docs.google.com/document/d/1L5L4W90L4UFgJUTLTM3wPb6udrtnw3iWfS8WNSpn8XM/edit?usp=sharing',
        sections: [],
      },
      {
        title: 'ICU everywhere',
        subtitle: '',
        links: [],
        media: [
          `${R2}projects/writings/images/03.png`,
          `${R2}projects/writings/images/04.png`,
        ],
        sideBySide: true,
        sections: [],
      },
      {
        title: 'parallel.',
        subtitle: '',
        links: [],
        media: [
          `${R2}projects/writings/images/00.png`,
        ],
        sections: [],
      },
    ],
  },
  {
    title: 'past shows',
    subtitle:
      'A small index of group exhibitions and show documentation. Select a show title to enter its individual project page.',
    links: [],
    media: [
      `${R2}projects/island-air-vol-v/images/00.jpg`,
      `${R2}projects/island-air-vol-iv/images/00.jpg`,
      `${R2}projects/the-space-that-remains/images/00.jpg`,
    ],
    children: [
      {
        title: 'Island Air Vol V: Wilderness',
        subtitle:
          'A wilderness-themed group art exhibit featuring the works of 16 visual, sound, and performance artists from the Pacific Northwest area, organized to be concurrent with the 2019 Seattle Art Fair.',
        links: [],
        manifestPath: 'projects/island-air-vol-v/manifest.txt',
        captions: [],
        sections: [
          section(
            'Project Statement',
            'I collaborated with artist <a href="https://aubreybirdwell.com" target="_blank" rel="noopener">Aubrey Birdwell</a> to produce a billboard advertisement for "wilderness". We also produced part of the costume for performance artist Butylene O\'Kipple. Besides participating as an artist, I also designed the flyers and related promotion material and helped with installation at the show.'
          ),
          section(
            'Process',
            'My contribution to the show included the flyer design, the piece Weekender, process documentation, and a headpiece for performance artist Butylene O\'Kipple.'
          ),
        ],
      },
      {
        title: 'Island Air Vol IV',
        subtitle:
          'A group art exhibit featuring the works of 8 visual and sound artists from the Pacific Northwest area.',
        links: [],
        manifestPath: 'projects/island-air-vol-iv/manifest.txt',
        captions: [],
        sections: [
          section(
            'Project Statement',
            'I contributed 6 pieces at this show. There is a video art installation, several pieces of sculptures, and a painting. Besides participating as an artist, I also set up the stage area for the sound artists and the DJ.'
          ),
          section(
            'Included Works',
            'Manufactured Volatility — video on CRTs.\n\nSometimes my mind — trash / paint / wood.\n\nDeath and Sumatra (child #01) — photograph of sculpture printed on metal.\n\nDeath and Sumatra — plastic / wood / paint / metal wires.\n\nChaos and Disorder (showed as WIP at this show) — plastic / wood / paint / mirror / LED.\n\nLucretia — acrylic on canvas.'
          ),
        ],
      },
      {
        title: 'The Space that Remains',
        subtitle:
          'A group art exhibit featuring the works of 8 visual and sound artists from the Pacific Northwest area, organized as part of the 2019 West Seattle Artwalk.',
        links: [],
        manifestPath: 'projects/the-space-that-remains/manifest.txt',
        captions: [],
        sections: [
          section(
            'Project Statement',
            'I contributed a painting at this show.'
          ),
        ],
      },
    ],
  },
  {
    title: 'Evading Online Keyword Censorship',
    subtitle:
      'Sensitive information, such as banned books and protest organization communications, require secure channels to evade private or state surveillance. This project aims to provide public access to a secure steganographic system for additional privacy in communications and underground publishing.',
    links: [
      link('Web Tool', 'https://main.d3v90zo52exf1d.amplifyapp.com/'),
      link('Research Doc', 'https://pub-c13cdb673b934fa282c9bb3c6f22046e.r2.dev/projects/pixel-ninja/pdf/PixelStacks__High_Capacity_Image_Steganography_for_Censorship_Circumvention_of_Long_Form_Content.pdf'),
      link('GitHub Repo', 'https://github.com/FifthEpoch/Chaos_LSB'),
    ],
    manifestPath: 'projects/keyword-censorship/manifest.txt',
    captions: [],
    videos: [
      {
        url: 'https://www.youtube.com/embed/InVZqq3yDvM',
        caption: 'A demo video that shows the <a href="https://main.d3v90zo52exf1d.amplifyapp.com/" target="_blank" rel="noopener">web tool</a>\'s embedding and extraction flow.',
      },
      {
        url: 'https://www.youtube.com/embed/kWjyqt2UMc0',
        caption: 'A narrated presentation about the research topic submitted to the University of Washington Undergraduate Research Symposium.',
      },
    ],
    sections: [
      section(
        'Abstract',
        'Internet censorship is often enforced via automated keyword filtering with a keyword list, implemented on a platform or state level. Individual users who discuss sensitive issues online may find their social media posts are made invisible or removed and may even have their accounts shut down.\n\nIn this literature, we propound steganography as a publishing infrastructure against internet keyword censorship. We conducted an experiment to confirm our hypothesis that steganography is a viable way to transmit sensitive information over censored networks. The end product is a publicly available, online steganography tool equipped with an improved version of an existing steganographic algorithm that uses random pixel selection to minimize noise in the stego image. We evaluated the proposed method against its predecessors and found that our method gives a higher quality of stego images in terms of peak signal-to-noise ratio and other common metrics used to measure image steganographic systems.'
      ),
    ],
  },
  {
    title: 'humanjuices',
    subtitle:
      'This is a website created for the artist Giannina Gomez who is a New York City-based fashion designer, performer, and puppeteer specializing in ironically sustainable fashion made from textile waste.',
    links: [],
    manifestPath: 'projects/humanjuices/manifest.txt',
    screenImage: 'projects/humanjuices/images/00.png',
    screenOverlay: true,
    directUrl: 'https://humanjuices.com',
    captions: [],
    sections: [],
  },
  {
    title: 'eliza',
    subtitle:
      'eliza is a web-based art project that lures participants into a mesmerizing maze-like website.',
    links: [
      link('WIP Website', 'https://fifthepoch.github.io/cam-site/'),
      link('GitHub', 'https://github.com/FifthEpoch'),
    ],
    manifestPath: 'projects/eliza/manifest.txt',
    screenImage: 'projects/eliza/images/00.png',
    screenOverlay: true,
    directUrl: 'https://fifthepoch.github.io/cam-site/',
    captions: [],
    sections: [
      section(
        '',
        'As visitors journey through its digital corridors, their mission unfolds: to rescue a mysterious entity that communicates with them. At the project\'s culmination, the entity unveils itself as a digital copy of the participant, turning the work into a reflection on self-intimacy, surveillance, and data privacy.\n\nThe vision I have is have an evolution of the chat entity. It is at first just a mirror-ing algorithm, modeled after the real ELIZA, the first chat bot ever existed created by researchers at MIT in the 60s. The entity then slowly evolves into a modern day LLM as visitors interacts with it in deeper and deeper ways. Eventually, I hope to support this site with heftier compute on the backend so that I can create a deepfaked persona of the current user so they can have a conversation with themselves.'
      ),
    ],
  },
  {
    title: 'Temporary Autonomous Zone Traditional Chinese Translation',
    subtitle:
      '5,000 copies of the translated text were made available for free in Hong Kong in 2020 with the help of 40+ volunteers.',
    links: [
      link('Read TAZ in zh', `${R2}projects/taz/pdf/TAZ_zh.pdf`),
      link('Translation Process', 'https://docs.google.com/document/d/1F7h-lngSmDhhjcMpVPkd9AAi8zhH9ubmwZjliRNsQNU/edit?usp=sharing'),
    ],
    manifestPath: 'projects/taz/manifest.txt',
    captions: [],
    sections: [
      section(
        'Media Summary',
        'A collection of photographs taken by either my volunteers or myself documenting the project. Activities included a symposium-style reading at ACO Books, an interview with Free Think Press covering the Hong Kong protests, and distribution through book stations set up at The Chinese University of Hong Kong, The University of Hong Kong, coffee shops, music schools, bookstores, and many more locations across the city. Posters bringing awareness to the protest-literature Telegram channel were posted in coffee shops, elevators, and street corners, and shared widely across the internet on LIHKG, Telegram, and Instagram.'
      ),
      section(
        'Project Statement',
        'This art-as-civic action initiative has several wildly different pieces involved in its making. As an artist, I have always seen art as something that cannot be confined inside exhibits, galleries, and museums. To a lot of people who make art, art exists in the process of making. We make communities in the process of making art. For me, the most fulfilling moments when I make art is when I see people coming together and socialize in the backdrop of an art show. Art should be a platform where unlikely strangers meet and discuss topics meaningful to them.\n\nWhen I got wind of the massive protests against an extradition law being proposed in Hong Kong, I knew I needed to contribute in some way. Using the translation of the Temporary Autonomous Zone as the center piece, I wanted to create a platform that enables discussions and exploration of new political perspectives. At the end, I ended up with a project which lies in the intersection of art, translation, and civic action. It was a precious opportunity to experience the power of a community, and the tenacity mutual aid provides to a political movement.\n\nThis project owes its success to the 40+ enthusiastic volunteers who contributed time and energy to various tasks, including translation reviews, footnote reviews, translation iterations, distribution location scouts, digital messengering, transportation of cargos, and distribution of books. While this project never had a fixed project team, the fluidity of the team\'s dynamic and the wide set of talent were instrumental to the realization of what would have diminished into a fleeting thought without their contribution.'
      ),
      section(
        'Book Design & Illustrations',
        'A series of illustrations produced exclusively for the Traditional Chinese translation of the Temporary Autonomous Zone: Commodity Fetishism (found digital media collage), Music as an Organizational Principle (3D modeling and image processing), Fiume (digital media collage and image processing), The Magic of Disappearance (digital design), Islands in the Net (processed photograph), Anne Bonnie (processed historic illustration and graphic design).'
      ),
    ],
  },
];
