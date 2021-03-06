var _ = require('lodash');
var events = require('events');
var fs = require('fs');
var fsPath = require('path');
var moment = require('moment');
var promisify = require('util').promisify;

var reflib = module.exports = {
	// .supported - Supported file types {{{
	supported: [
		{
			id: 'csv',
			name: 'Comma Seperated Values',
			ext: ['.csv'],
			filename: 'references.csv',
			driver: require('reflib-csv'),
		},
		{
			id: 'endnotexml',
			name: 'EndNote XML file',
			ext: ['.xml'],
			filename: 'endnote.xml',
			driver: require('reflib-endnotexml'),
		},
		{
			id: 'json',
			name: 'JSON file',
			ext: ['.json'],
			filename: 'library.json',
			driver: require('reflib-json'),
		},
		{
			id: 'medline',
			name: 'MEDLINE / PubMed file',
			ext: ['.nbib'],
			filename: 'medline.nbib',
			driver: require('reflib-medline'),
		},
		{
			id: 'ris',
			name: 'RIS file',
			ext: ['.ris'],
			filename: 'ris.ris',
			driver: require('reflib-ris'),
		},
		{
			id: 'tsv',
			name: 'Tab Seperated Values',
			ext: ['.tsv'],
			filename: 'references.tsv',
			driver: require('reflib-tsv'),
		},
	],
	// }}}

	// .refTypes - Supported reference types {{{
	refTypes: [
		{id: 'aggregatedDatabase', title: 'Aggregated Database'},
		{id: 'ancientText', title: 'Ancient Text'},
		{id: 'artwork', title: 'Artwork'},
		{id: 'audiovisualMaterial', title: 'Audiovisual Material'},
		{id: 'bill', title: 'Bill'},
		{id: 'blog', title: 'Blog'},
		{id: 'book', title: 'Book'},
		{id: 'bookSection', title: 'Book Section'},
		{id: 'case', title: 'Case'},
		{id: 'catalog', title: 'Catalog'},
		{id: 'chartOrTable', title: 'Chart or Table'},
		{id: 'classicalWork', title: 'Classical Work'},
		{id: 'computerProgram', title: 'Computer Program'},
		{id: 'conferencePaper', title: 'Conference Paper'},
		{id: 'conferenceProceedings', title:'Conference Proceedings'},
		{id: 'dataset', title: 'Dataset.'},
		{id: 'dictionary', title: 'Dictionary'},
		{id: 'editedBook', title: 'Edited Book'},
		{id: 'electronicArticle', title: 'Electronic Article'},
		{id: 'electronicBook', title:', Electronic Book'},
		{id: 'electronicBookSection', title:', Electronic Book Section'},
		{id: 'encyclopedia', title: 'Encyclopedia'},
		{id: 'equation', title: 'Equation'},
		{id: 'figure', title: 'Figure'},
		{id: 'filmOrBroadcast', title: 'Film or Broadcast'},
		{id: 'generic', title: 'Generic'},
		{id: 'governmentDocument', title: 'Government Document'},
		{id: 'grant', title: 'Grant'},
		{id: 'hearing', title: 'Hearing'},
		{id: 'journalArticle', title: 'Journal Article'},
		{id: 'legalRuleOrRegulation', title:', Legal Rule or Regulation'},
		{id: 'magazineArticle', title: 'Magazine Article'},
		{id: 'manuscript', title: 'Manuscript'},
		{id: 'map', title: 'Map'},
		{id: 'music', title: 'Music'},
		{id: 'newspaperArticle', title: 'Newspaper Article'},
		{id: 'onlineDatabase', title: 'Online Database'},
		{id: 'onlineMultimedia', title: 'Online Multimedia'},
		{id: 'pamphlet', title: 'Pamphlet'},
		{id: 'patent', title: 'Patent'},
		{id: 'personalCommunication', title: 'Personal Communication'},
		{id: 'report', title: 'Report'},
		{id: 'serial', title: 'Serial'},
		{id: 'standard', title: 'Standard'},
		{id: 'statute', title: 'Statute'},
		{id: 'thesis', title: 'Thesis'},
		{id: 'unpublished', title: 'Unpublished Work'},
		{id: 'web', title: 'Web Page'},
	],
	// }}}

	identify: function(filename) {
		var ext = fsPath.extname(filename).toLowerCase();
		var found = reflib.supported.find(format => _.includes(format.ext, ext));
		return found ? found.id : false;
	},

	parse: function(format, input, options, callback) {
		var self = this;

		// Deal with arguments {{{
		if (_.isString(format) && !_.isEmpty(input) && _.isObject(options) && _.isFunction(callback)) {
			// No changes
		} else if (_.isString(format) && !_.isEmpty(input) && _.isFunction(options)) { // Omitted options
			callback = options;
			options = {};
		} else if (_.isString(format) && !_.isEmpty(input)) { // Omitted options + callback
			// No changes
		} else {
			throw new Error('Parse must be called in the form: parse(format, input, [options], [callback])');
		}
		// }}}

		var supported = reflib.supported.find(s => s.id == format);
		if (!supported) throw new Error('Format is unsupported: ' + format);

		var settings = _.defaults(options, {
			fixes: {
				authors: false,
				dates: false,
				pages: false,
			},
		});

		var refs = [];
		var reflibEmitter = new events.EventEmitter();

		supported.driver.parse(input)
			.on('error', function(err) {
				if (callback) {
					callback(err);
				} else {
					reflibEmitter.emit('error', err);
				}
			})
			.on('ref', function(ref) {
				// Apply fixes {{{
				if (settings.fixes.authors) ref = self.fix.authors(ref, options);
				if (settings.fixes.dates) ref = self.fix.dates(ref, options);
				if (settings.fixes.pages) ref = self.fix.pages(ref, options);
				// }}}

				if (callback) {
					refs.push(ref);
				} else {
					reflibEmitter.emit('ref', ref);
				}
			})
			.on('progress', function(cur, max) {
				reflibEmitter.emit('progress', cur, max);
			})
			.on('end', function() {
				if (callback) {
					callback(null, refs);
				} else {
					reflibEmitter.emit('end');
				}
			});

		return reflibEmitter;
	},

	parseFile: function(path, options, callback) {
		// Argument mangling {{{
		if (_.isFunction(options)) { // path, callback
			callback = options;
			options = {};
		}
		// }}}

		var driver = reflib.identify(path);
		if (!driver) throw new Error('File type is unsupported');
		return reflib.parse(driver, fs.createReadStream(path), options, callback);
	},

	output: function(options) {
		if (!_.isObject(options)) throw new Error('output(options) must be an object');
		if (!options.format) throw new Error('output(options) must specify a format');

		var supported = reflib.supported.find(s => s.id == options.format);
		if (!supported) throw new Error('Format is unsupported: ' + options.format);

		var settings = _.defaults(options, {
			fields: _.isString(options.fields) ? options.fields.split(/\s*,\s*/) : undefined, // Split field list into an array if given a CSV
		});

		return supported.driver.output(settings);
	},

	outputFile: function(path, refs, options, callback) {
		// Argument mangling {{{
		if (_.isFunction(options)) { // path, refs, callback
			callback = options;
			options = {};
		}
		// }}}

		var driver = reflib.identify(path);
		if (!driver) throw new Error('File type is unsupported for path: ' + path);
		var stream = fs.createWriteStream(path);
		var out = reflib.output(_.defaults(options, {
			format: driver,
			stream: stream,
			content: refs,
		}));
		if (callback) { // If optional callback is specified attach it as a handler
			out.on('error', callback);
			out.on('finish', callback);
		}
		return out;
	},

	// Fixes {{{
	fix: {
		authors: function(ref, options) {
			if (_.isArray(ref.authors) && ref.authors.length == 1 && /;/.test(ref.authors[0]))
				ref.authors = ref.authors[0].split(/\s*;\s*/);

			return ref;
		},

		dates: function(ref, options) {
			var settings = _.defaults(options, {
				dateFormats: [
					{format: 'MM-DD-YYYY', year: true, month: true, day: true},
					{format: 'DD/MM/YYYY', year: true, month: true, day: true},
					{format: 'DD-MM-YYYY', year: true, month: true, day: true},
					{format: 'YYYY-MM-DD', year: true, month: true, day: true},
					{format: 'Do MMMM YY', year: true, month: true, day: true},
					{format: 'Do MMMM YYYY', year: true, month: true, day: true},
					{format: 'MMM YYYY', year: true, month: true, day: false},
					{format: 'MMM', year: false, month: true, day: false},
					{format: 'MMMM', year: false, month: true, day: false},
					{format: 'YYYY', year: true, month: false, day: false},
				],
			});

			var baseYear = 1000; // Anything equal to this is assumed not to provide a year
			moment.now = function() { return +new Date(baseYear, 1, 1) }; // Force Moment to use baseYear as the basis when parsing
			var momentParsed = moment(ref.date, settings.dateFormats.map(function(f) { return f.format }), true);

			if (ref.date && momentParsed.isValid()) { // Moment matched something
				var dateFormat = settings.dateFormats.find(function(f) { return (f.format == momentParsed._f) });
				if (!dateFormat) throw new Error('Moment parsed date but cannot locate matching format it used!');

				if (dateFormat.year && dateFormat.month && dateFormat.day) { // Date format is fully formed
					ref.date = momentParsed.toDate();
				}

				if (dateFormat.year) ref.year = momentParsed.year();
				if (dateFormat.month) ref.month = momentParsed.format('MMM');
			}

			return ref;
		},

		pages: function(ref) {
			var p = /^\s*([0-9]+)\s*--?\s*([0-9]+)\s*$/.exec(ref.pages);
			if (p) {
				var numericLeft = _.toNumber(p[1]);
				var numericRight = _.toNumber(p[2]);

				if (numericRight < numericLeft) { // Relative number reference e.g. '123 - 4'
					numericRight = numericLeft.toString().substr(0, numericLeft.toString().length - numericRight.toString().length) + numericRight.toString();
				}

				ref.pages = numericLeft + '-' + numericRight;
				return ref;
			}

			return ref;
		},
	},
	// }}}
};

// Compute promises {{{
reflib.promises = _(reflib)
	.pickBy(v => _.isFunction(v))
	.mapValues(v => promisify(v))
	.value();
// }}}
