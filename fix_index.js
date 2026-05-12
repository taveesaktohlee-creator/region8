const fs = require('fs');
let content = fs.readFileSync('src/index.tsx', 'utf8');

// Remove HeroUI imports
content = content.replace(/import\s*\{[^}]*\}\s*from\s*'@heroui\/react';/, '');

// Avatar
content = content.replace(/<Avatar src="([^"]+)" size="md" className="([^"]+)" \/>/g, '<img src="$1" className="w-10 h-10 rounded-full object-cover $2" alt="Avatar" />');
content = content.replace(/<Avatar src=\{worker\.avatar\} className=\{`bg-gradient-to-br \$\{worker\.color\}`\} \/>/g, '<img src={worker.avatar} className={`w-10 h-10 rounded-full object-cover bg-gradient-to-br ${worker.color}`} alt={worker.name} />');

// Buttons
content = content.replace(/<Button color="primary" className="font-semibold rounded-full px-5 shadow-md shadow-blue-500\/20" startContent=\{<UserPlus size=\{16\} \/>\}>\s*Invite\s*<\/Button>/, '<button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-full px-5 py-2 shadow-md shadow-blue-500/20 transition-colors"><UserPlus size={16} />Invite</button>');
content = content.replace(/<Button color="primary" className="font-semibold shadow-md shadow-blue-500\/20" rounded="full">\s*Download\s*<\/Button>/, '<button className="bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-md shadow-blue-500/20 rounded-full px-6 py-2 transition-colors">Download</button>');
content = content.replace(/<Button variant="bordered" className="bg-white shadow-sm border-gray-100 font-semibold text-gray-700" startContent=\{<Calendar size=\{16\} className="text-gray-500" \/>\} endContent=\{<ChevronDown size=\{14\} className="text-gray-500" \/>\}>\s*Monthly\s*<\/Button>/, '<button className="flex items-center gap-2 bg-white hover:bg-gray-50 text-gray-700 font-semibold shadow-sm border border-gray-100 rounded-xl px-4 py-2 transition-colors"><Calendar size={16} className="text-gray-500" />Monthly<ChevronDown size={14} className="text-gray-500" /></button>');
content = content.replace(/<Button variant="light" className="text-gray-500 bg-gray-50\/50 font-medium" size="sm" endContent=\{<ChevronDown size=\{14\} \/>\}>\s*Last 2 weeks\s*<\/Button>/, '<button className="flex items-center gap-1 text-gray-500 bg-gray-50/50 hover:bg-gray-100 font-medium rounded-lg px-3 py-1.5 text-sm transition-colors">Last 2 weeks<ChevronDown size={14} /></button>');
content = content.replace(/<Button variant="flat" className="bg-gray-100 text-gray-700 font-semibold hidden md:flex" startContent=\{<Filter size=\{16\} \/>\}>\s*Filter\s*<\/Button>/, '<button className="hidden md:flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl px-4 py-2 text-sm transition-colors"><Filter size={16} />Filter</button>');
content = content.replace(/<Button variant="flat" className="bg-gray-100 text-gray-700 font-semibold hidden md:flex" startContent=\{<ArrowUpDown size=\{16\} \/>\}>\s*Sort\s*<\/Button>/, '<button className="hidden md:flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl px-4 py-2 text-sm transition-colors"><ArrowUpDown size={16} />Sort</button>');
content = content.replace(/<Button variant="flat" className="bg-gray-100 text-gray-700 font-semibold hidden md:flex" startContent=\{<Columns size=\{16\} \/>\}>\s*Columns\s*<\/Button>/, '<button className="hidden md:flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl px-4 py-2 text-sm transition-colors"><Columns size={16} />Columns</button>');

// Input
content = content.replace(/<Input\s*classNames=\{\{[\s\S]*?\}\}\s*placeholder="Search\.\.\."\s*startContent=\{<Search size=\{18\} className="text-gray-400" \/>\}\s*\/>/, '<div className="relative"><Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input type="text" placeholder="Search..." className="w-full sm:w-64 h-10 bg-gray-100 border-none shadow-none rounded-xl hover:bg-gray-200 focus:bg-gray-200 transition-colors pl-10 pr-4 text-sm font-medium focus:outline-none" /></div>');

// Chip
content = content.replace(/<Chip size="sm" variant="flat" color="primary" className="font-semibold px-2">New<\/Chip>/g, '<span className="bg-blue-100 text-blue-700 text-xs font-semibold px-2 py-1 rounded-full">New</span>');
content = content.replace(/<Chip size="sm" variant="flat" className="bg-gray-100 text-gray-500 font-semibold px-2">Returning<\/Chip>/g, '<span className="bg-gray-100 text-gray-600 text-xs font-semibold px-2 py-1 rounded-full">Returning</span>');

// Pagination
content = content.replace(/<Pagination\s*total=\{7\}\s*initialPage=\{1\}\s*color="primary"\s*size="sm"\s*classNames=\{\{ cursor: "font-semibold shadow-md", item: "font-medium" \}\}\s*\/>/, '<div className="flex items-center gap-1"><button className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 text-gray-500 text-sm hover:bg-gray-200">&lt;</button><button className="w-8 h-8 flex items-center justify-center rounded-lg bg-blue-600 text-white shadow-md font-semibold text-sm">1</button><button className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-50 text-gray-700 font-medium text-sm hover:bg-gray-100">2</button><button className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-50 text-gray-700 font-medium text-sm hover:bg-gray-100">3</button><span className="px-1 text-gray-400">...</span><button className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-50 text-gray-700 font-medium text-sm hover:bg-gray-100">7</button><button className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 text-gray-500 text-sm hover:bg-gray-200">&gt;</button></div>');

// Tooltips
content = content.replace(/<Tooltip content="([^"]+)"(?: color="danger")?>\s*<button([^>]+)>\s*<([a-zA-Z0-9]+) size=\{16\} \/>\s*<\/button>\s*<\/Tooltip>/g, '<div className="group relative"><button$2><$3 size={16} /></button><div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">$1</div></div>');

fs.writeFileSync('src/index.tsx', content);
