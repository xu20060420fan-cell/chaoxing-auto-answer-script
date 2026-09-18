// ==UserScript==
// @name         学习通-随堂测验/章节测试/作业/考试题目一键提取导出pdf/word/txt/markdown格式文档
// @namespace    https://tiku888.top/
// @license      GPL-3.0
// @version      1.7.23
// @run-at       document-start
// @description  一键提取学习通作业题目，支持富文本（图文混排）及 Word/PDF/TXT/MD 四种格式导出、按课程任务点自动逐个提取章节测验、题目勾选后按范围导出，答案/错题收集，独立题库区（新建/存取/编辑/手动添加/导入/四种格式导出/题库对比），暗色模式，快捷键，iframe 提取
// @author       suyu
// @icon         http://pan-yz.chaoxing.com/favicon.ico
// @match        *://*.chaoxing.com/*
// @match        *://*.edu.cn/*
// @match        *://xuexitong.com/*
// @match        *://*.xuexitong.com/*
// @require      https://unpkg.com/docx@8.5.0/build/index.umd.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js
// @resource     XXT_FONT_TABLE https://cdn.ocsjs.com/resources/font/table.json
// @grant        GM_getResourceText
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      cdn.ocsjs.com
// ==/UserScript==

(function () {
  'use strict';
  /*
   * Embedded readable font-decoder dependencies (MIT):
   * Typr.js — Copyright (c) 2016 Photopea
   * https://github.com/photopea/Typr.js
   * blueimp-md5 — Copyright (c) 2011 Sebastian Tschan, https://blueimp.net
   * https://github.com/blueimp/JavaScript-MD5
   * Fixed upstream sources:
   * - Typr.js: https://cdn.jsdelivr.net/gh/photopea/Typr.js@15aa12ffa6cf39e8788562ea4af65b42317375fb/src/Typr.js (SHA-256 e906fc581293ebb6c005e472f7d5b038ca9c8f6e40927ad450ba90f8b7377971)
   * - Typr.U.js: https://cdn.jsdelivr.net/gh/photopea/Typr.js@f4fcdeb8014edc75ab7296bd85ac9cde8cb30489/src/Typr.U.js (SHA-256 36f0c3bfd9c11ae6d2336e02e65f10442d6dec134431e9d980f5db508fc96b86)
   * - blueimp-md5.js: https://cdn.jsdelivr.net/npm/blueimp-md5@2.19.0/js/md5.js (SHA-256 619f6de12c8847a834cfc843b92a9a9f9e3a431adc3c566b74896957c853caa5)
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   */
  /* ===== Begin embedded Typr.js (upstream readable source) ===== */


var Typr = {};

Typr["parse"] = function(buff)
{
	var readFont = function(data, idx, offset,tmap) {
		var bin = Typr["B"];

		var T = Typr["T"];
		var prsr = {
			"cmap":T.cmap,
			"head":T.head,
			"hhea":T.hhea,
			"maxp":T.maxp,
			"hmtx":T.hmtx,
			"name":T.name,
			"OS/2":T.OS2,
			"post":T.post,

			"loca":T.loca,
			"kern":T.kern,
			"glyf":T.glyf,

			"CFF ":T.CFF,
			/*
			"GPOS",
			"GSUB",
			"GDEF",*/

			"SVG ":T.SVG
			//"VORG",
		};
		var obj = {"_data":data, "_index":idx, "_offset":offset};

		for(var t in prsr) {
			var tab = Typr["findTable"](data, t, offset);
			if(tab) {
				var off=tab[0], tobj = tmap[off];
				if(tobj==null) tobj = prsr[t].parseTab(data, off, tab[1], obj);
				obj[t] = tmap[off] = tobj;
			}
		}
		return obj;
	}


	var bin = Typr["B"];
	var data = new Uint8Array(buff);

	var tmap = {};
	var tag = bin.readASCII(data, 0, 4);
	if(tag=="ttcf") {
		var offset = 4;
		var majV = bin.readUshort(data, offset);  offset+=2;
		var minV = bin.readUshort(data, offset);  offset+=2;
		var numF = bin.readUint  (data, offset);  offset+=4;
		var fnts = [];
		for(var i=0; i<numF; i++) {
			var foff = bin.readUint  (data, offset);  offset+=4;
			fnts.push(readFont(data, i, foff,tmap));
		}
		return fnts;
	}
	else return [readFont(data, 0, 0,tmap)];
}


Typr["findTable"] = function(data, tab, foff)
{
	var bin = Typr["B"];
	var numTables = bin.readUshort(data, foff+4);
	var offset = foff+12;
	for(var i=0; i<numTables; i++)
	{
		var tag      = bin.readASCII(data, offset, 4);
		var checkSum = bin.readUint (data, offset+ 4);
		var toffset  = bin.readUint (data, offset+ 8);
		var length   = bin.readUint (data, offset+12);
		if(tag==tab) return [toffset,length];
		offset+=16;
	}
	return null;
}
/*
Typr["splitBy"] = function(data,tag) {
	data = new Uint8Array(data);  console.log(data.slice(0,64));
	var bin = Typr["B"];
	var ttcf = bin.readASCII(data, 0, 4);  if(ttcf!="ttcf") return {};

	var offset = 8;
	var numF = bin.readUint  (data, offset);  offset+=4;
	var colls = [], used={};
	for(var i=0; i<numF; i++) {
		var foff = bin.readUint  (data, offset);  offset+=4;
		var toff = Typr["findTable"](data,tag,foff)[0];
		if(used[toff]==null) used[toff] = [];
		used[toff].push([foff,bin.readUshort(data,foff+4)]);  // font offset, numTables
	}
	for(var toff in used) {
		var offs = used[toff];
		var hlen = 12+4*offs.length;
		var out = new Uint8Array(hlen);
		for(var i=0; i<8; i++) out[i]=data[i];
		bin.writeUint(out,8,offs.length);

		for(var i=0; i<offs.length; i++) hlen += 12+offs[i][1]*16;

		var hdrs = [out], tabs = [], hoff=out.length, toff=hlen, noffs={};
		for(var i=0; i<offs.length; i++) {
			bin.writeUint(out, 12+i*4, hoff);  hoff+=12+offs[i][1]*16;
			toff = Typr["_cutFont"](data, offs[i][0], hdrs, tabs, toff, noffs);
		}
		colls.push(Typr["_joinArrs"](hdrs.concat(tabs)));
	}
	return colls;
}

Typr["splitFonts"] = function(data) {
	data = new Uint8Array(data);
	var bin = Typr["B"];
	var ttcf = bin.readASCII(data, 0, 4);  if(ttcf!="ttcf") return {};

	var offset = 8;
	var numF = bin.readUint  (data, offset);  offset+=4;
	var fnts = [];
	for(var i=0; i<numF; i++) {
		var foff = bin.readUint  (data, offset);  offset+=4;
		fnts.push(Typr._cutFont(data, foff));
		break;
	}
	return fnts;
}

Typr["_cutFont"] = function(data,foff,hdrs,tabs,toff, noffs) {
	var bin = Typr["B"];
	var numTables = bin.readUshort(data, foff+4);

	var out = new Uint8Array(12+numTables*16);  hdrs.push(out);
	for(var i=0; i<12; i++) out[i]=data[foff+i];  //console.log(out);

	var off = 12;
	for(var i=0; i<numTables; i++)
	{
		var tag      = bin.readASCII(data, foff+off, 4);
		var checkSum = bin.readUint (data, foff+off+ 4);
		var toffset  = bin.readUint (data, foff+off+ 8);
		var length   = bin.readUint (data, foff+off+12);

		while((length&3)!=0) length++;

		for(var j=0; j<16; j++) out[off+j]=data[foff+off+j];

		if(noffs[toffset]!=null) bin.writeUint(out,off+8,noffs[toffset]);
		else {
			noffs[toffset] = toff;
			bin.writeUint(out, off+8, toff);
			tabs.push(new Uint8Array(data.buffer, toffset, length));  toff+=length;
		}
		off+=16;
	}
	return toff;
}
Typr["_joinArrs"] = function(tabs) {
	var len = 0;
	for(var i=0; i<tabs.length; i++) len+=tabs[i].length;
	var out = new Uint8Array(len), ooff=0;
	for(var i=0; i<tabs.length; i++) {
		var tab = tabs[i];
		for(var j=0; j<tab.length; j++) out[ooff+j]=tab[j];
		ooff+=tab.length;
	}
	return out;
}
*/

Typr["T"]={};





Typr["B"] = {
	readFixed : function(data, o)
	{
		return ((data[o]<<8) | data[o+1]) +  (((data[o+2]<<8)|data[o+3])/(256*256+4));
	},
	readF2dot14 : function(data, o)
	{
		var num = Typr["B"].readShort(data, o);
		return num / 16384;
	},
	readInt : function(buff, p)
	{
		//if(p>=buff.length) throw "error";
		var a = Typr["B"].t.uint8;
		a[0] = buff[p+3];
		a[1] = buff[p+2];
		a[2] = buff[p+1];
		a[3] = buff[p];
		return Typr["B"].t.int32[0];
	},

	readInt8 : function(buff, p)
	{
		//if(p>=buff.length) throw "error";
		var a = Typr["B"].t.uint8;
		a[0] = buff[p];
		return Typr["B"].t.int8[0];
	},
	readShort : function(buff, p)
	{
		//if(p>=buff.length) throw "error";
		var a = Typr["B"].t.uint8;
		a[1] = buff[p]; a[0] = buff[p+1];
		return Typr["B"].t.int16[0];
	},
	readUshort : function(buff, p)
	{
		//if(p>=buff.length) throw "error";
		return (buff[p]<<8) | buff[p+1];
	},
	writeUshort : function(buff, p, n)
	{
		buff[p] = (n>>8)&255;  buff[p+1] = n&255;
	},
	readUshorts : function(buff, p, len)
	{
		var arr = [];
		for(var i=0; i<len; i++) {
			var v = Typr["B"].readUshort(buff, p+i*2);  //if(v==932) console.log(p+i*2);
			arr.push(v);
		}
		return arr;
	},
	readUint : function(buff, p)
	{
		//if(p>=buff.length) throw "error";
		var a = Typr["B"].t.uint8;
		a[3] = buff[p];  a[2] = buff[p+1];  a[1] = buff[p+2];  a[0] = buff[p+3];
		return Typr["B"].t.uint32[0];
	},
	writeUint: function(buff, p, n)
	{
		buff[p] = (n>>24)&255;  buff[p+1] = (n>>16)&255;  buff[p+2] = (n>>8)&255;  buff[p+3] = (n>>0)&255;
	},
	readUint64 : function(buff, p)
	{
		//if(p>=buff.length) throw "error";
		return (Typr["B"].readUint(buff, p)*(0xffffffff+1)) + Typr["B"].readUint(buff, p+4);
	},
	readASCII : function(buff, p, l)	// l : length in Characters (not Bytes)
	{
		//if(p>=buff.length) throw "error";
		var s = "";
		for(var i = 0; i < l; i++) s += String.fromCharCode(buff[p+i]);
		return s;
	},
	writeASCII : function(buff, p, s)	// l : length in Characters (not Bytes)
	{
		for(var i = 0; i < s.length; i++)
			buff[p+i] = s.charCodeAt(i);
	},
	readUnicode : function(buff, p, l)
	{
		//if(p>=buff.length) throw "error";
		var s = "";
		for(var i = 0; i < l; i++)
		{
			var c = (buff[p++]<<8) | buff[p++];
			s += String.fromCharCode(c);
		}
		return s;
	},
	_tdec : window["TextDecoder"] ? new window["TextDecoder"]() : null,
	readUTF8 : function(buff, p, l) {
		var tdec = Typr["B"]._tdec;
		if(tdec && p==0 && l==buff.length) return tdec["decode"](buff);
		return Typr["B"].readASCII(buff,p,l);
	},
	readBytes : function(buff, p, l)
	{
		//if(p>=buff.length) throw "error";
		var arr = [];
		for(var i=0; i<l; i++) arr.push(buff[p+i]);
		return arr;
	},
	readASCIIArray : function(buff, p, l)	// l : length in Characters (not Bytes)
	{
		//if(p>=buff.length) throw "error";
		var s = [];
		for(var i = 0; i < l; i++)
			s.push(String.fromCharCode(buff[p+i]));
		return s;
	},
	t : function() {
		var ab = new ArrayBuffer(8);
		return {
			buff   : ab,
			int8   : new Int8Array  (ab),
			uint8  : new Uint8Array (ab),
			int16  : new Int16Array (ab),
			uint16 : new Uint16Array(ab),
			int32  : new Int32Array (ab),
			uint32 : new Uint32Array(ab)
		}
	}()
};






	Typr["T"].CFF = {
		parseTab : function(data, offset, length)
		{
			var bin = Typr["B"];
			var CFF = Typr["T"].CFF;

			data = new Uint8Array(data.buffer, offset, length);
			offset = 0;

			// Header
			var major = data[offset];  offset++;
			var minor = data[offset];  offset++;
			var hdrSize = data[offset];  offset++;
			var offsize = data[offset];  offset++;
			//console.log(major, minor, hdrSize, offsize);

			// Name INDEX
			var ninds = [];
			offset = CFF.readIndex(data, offset, ninds);
			var names = [];

			for(var i=0; i<ninds.length-1; i++) names.push(bin.readASCII(data, offset+ninds[i], ninds[i+1]-ninds[i]));
			offset += ninds[ninds.length-1];


			// Top DICT INDEX
			var tdinds = [];
			offset = CFF.readIndex(data, offset, tdinds);  //console.log(tdinds);
			// Top DICT Data
			var topDicts = [];
			for(var i=0; i<tdinds.length-1; i++) topDicts.push( CFF.readDict(data, offset+tdinds[i], offset+tdinds[i+1]) );
			offset += tdinds[tdinds.length-1];
			var topdict = topDicts[0];
			//console.log(topdict);

			// String INDEX
			var sinds = [];
			offset = CFF.readIndex(data, offset, sinds);
			// String Data
			var strings = [];
			for(var i=0; i<sinds.length-1; i++) strings.push(bin.readASCII(data, offset+sinds[i], sinds[i+1]-sinds[i]));
			offset += sinds[sinds.length-1];

			// Global Subr INDEX  (subroutines)
			CFF.readSubrs(data, offset, topdict);

			// charstrings

			if(topdict["CharStrings"]) topdict["CharStrings"] = CFF.readBytes(data, topdict["CharStrings"]);

			// CID font
			if(topdict["ROS"]) {
				offset = topdict["FDArray"];
				var fdind = [];
				offset = CFF.readIndex(data, offset, fdind);

				topdict["FDArray"] = [];
				for(var i=0; i<fdind.length-1; i++) {
					var dict = CFF.readDict(data, offset+fdind[i], offset+fdind[i+1]);
					CFF._readFDict(data, dict, strings);
					topdict["FDArray"].push( dict );
				}
				offset += fdind[fdind.length-1];

				offset = topdict["FDSelect"];
				topdict["FDSelect"] = [];
				var fmt = data[offset];  offset++;
				if(fmt==3) {
					var rns = bin.readUshort(data, offset);  offset+=2;
					for(var i=0; i<rns+1; i++) {
						topdict["FDSelect"].push(bin.readUshort(data, offset), data[offset+2]);  offset+=3;
					}
				}
				else throw fmt;
			}

			// Encoding
			//if(topdict["Encoding"]) topdict["Encoding"] = CFF.readEncoding(data, topdict["Encoding"], topdict["CharStrings"].length);

			// charset
			if(topdict["charset"] ) topdict["charset"]  = CFF.readCharset (data, topdict["charset"] , topdict["CharStrings"].length);

			CFF._readFDict(data, topdict, strings);
			return topdict;
		},

		_readFDict : function(data, dict, ss) {
			var CFF = Typr["T"].CFF;
			var offset;
			if(dict["Private"]) {
				offset = dict["Private"][1];
				dict["Private"] = CFF.readDict(data, offset, offset+dict["Private"][0]);
				if(dict["Private"]["Subrs"]) CFF.readSubrs(data, offset+dict["Private"]["Subrs"], dict["Private"]);
			}
			for(var p in dict) if(["FamilyName","FontName","FullName","Notice","version","Copyright"].indexOf(p)!=-1)  dict[p]=ss[dict[p] -426 + 35];
		},

		readSubrs : function(data, offset, obj)
		{
			obj["Subrs"] = Typr["T"].CFF.readBytes(data, offset);

			var bias, nSubrs = obj["Subrs"].length+1;
			if (false) bias = 0;
			else if (nSubrs <  1240) bias = 107;
			else if (nSubrs < 33900) bias = 1131;
			else bias = 32768;
			obj["Bias"] = bias;
		},
		readBytes : function(data, offset) {
			var bin = Typr["B"];
			var arr = [];
			offset = Typr["T"].CFF.readIndex(data, offset, arr);

			var subrs = [], arl = arr.length-1, no = data.byteOffset+offset;
			for(var i=0; i<arl; i++) {
				var ari = arr[i];
				subrs.push(new Uint8Array(data.buffer, no+ari, arr[i+1]-ari));
			}
			return subrs;
		},

		tableSE : [
		  0,   0,   0,   0,   0,   0,   0,   0,
		  0,   0,   0,   0,   0,   0,   0,   0,
		  0,   0,   0,   0,   0,   0,   0,   0,
		  0,   0,   0,   0,   0,   0,   0,   0,
		  1,   2,   3,   4,   5,   6,   7,   8,
		  9,  10,  11,  12,  13,  14,  15,  16,
		 17,  18,  19,  20,  21,  22,  23,  24,
		 25,  26,  27,  28,  29,  30,  31,  32,
		 33,  34,  35,  36,  37,  38,  39,  40,
		 41,  42,  43,  44,  45,  46,  47,  48,
		 49,  50,  51,  52,  53,  54,  55,  56,
		 57,  58,  59,  60,  61,  62,  63,  64,
		 65,  66,  67,  68,  69,  70,  71,  72,
		 73,  74,  75,  76,  77,  78,  79,  80,
		 81,  82,  83,  84,  85,  86,  87,  88,
		 89,  90,  91,  92,  93,  94,  95,   0,
		  0,   0,   0,   0,   0,   0,   0,   0,
		  0,   0,   0,   0,   0,   0,   0,   0,
		  0,   0,   0,   0,   0,   0,   0,   0,
		  0,   0,   0,   0,   0,   0,   0,   0,
		  0,  96,  97,  98,  99, 100, 101, 102,
		103, 104, 105, 106, 107, 108, 109, 110,
		  0, 111, 112, 113, 114,   0, 115, 116,
		117, 118, 119, 120, 121, 122,   0, 123,
		  0, 124, 125, 126, 127, 128, 129, 130,
		131,   0, 132, 133,   0, 134, 135, 136,
		137,   0,   0,   0,   0,   0,   0,   0,
		  0,   0,   0,   0,   0,   0,   0,   0,
		  0, 138,   0, 139,   0,   0,   0,   0,
		140, 141, 142, 143,   0,   0,   0,   0,
		  0, 144,   0,   0,   0, 145,   0,   0,
		146, 147, 148, 149,   0,   0,   0,   0
		],

		glyphByUnicode : function(cff, code)
		{
			for(var i=0; i<cff["charset"].length; i++) if(cff["charset"][i]==code) return i;
			return -1;
		},

		glyphBySE : function(cff, charcode)	// glyph by standard encoding
		{
			if ( charcode < 0 || charcode > 255 ) return -1;
			return Typr["T"].CFF.glyphByUnicode(cff, Typr["T"].CFF.tableSE[charcode]);
		},

		/*readEncoding : function(data, offset, num)
		{
			var bin = Typr["B"];

			var array = ['.notdef'];
			var format = data[offset];  offset++;
			//console.log("Encoding");
			//console.log(format);

			if(format==0)
			{
				var nCodes = data[offset];  offset++;
				for(var i=0; i<nCodes; i++)  array.push(data[offset+i]);
			}
			/*
			else if(format==1 || format==2)
			{
				while(charset.length<num)
				{
					var first = bin.readUshort(data, offset);  offset+=2;
					var nLeft=0;
					if(format==1) {  nLeft = data[offset];  offset++;  }
					else          {  nLeft = bin.readUshort(data, offset);  offset+=2;  }
					for(var i=0; i<=nLeft; i++)  {  charset.push(first);  first++;  }
				}
			}

			else throw "error: unknown encoding format: " + format;

			return array;
		},*/

		readCharset : function(data, offset, num)
		{
			var bin = Typr["B"];

			var charset = ['.notdef'];
			var format = data[offset];  offset++;

			if(format==0)
			{
				for(var i=0; i<num; i++)
				{
					var first = bin.readUshort(data, offset);  offset+=2;
					charset.push(first);
				}
			}
			else if(format==1 || format==2)
			{
				while(charset.length<num)
				{
					var first = bin.readUshort(data, offset);  offset+=2;
					var nLeft=0;
					if(format==1) {  nLeft = data[offset];  offset++;  }
					else          {  nLeft = bin.readUshort(data, offset);  offset+=2;  }
					for(var i=0; i<=nLeft; i++)  {  charset.push(first);  first++;  }
				}
			}
			else throw "error: format: " + format;

			return charset;
		},

		readIndex : function(data, offset, inds)
		{
			var bin = Typr["B"];

			var count = bin.readUshort(data, offset)+1;  offset+=2;
			var offsize = data[offset];  offset++;

			if     (offsize==1) for(var i=0; i<count; i++) inds.push( data[offset+i] );
			else if(offsize==2) for(var i=0; i<count; i++) inds.push( bin.readUshort(data, offset+i*2) );
			else if(offsize==3) for(var i=0; i<count; i++) inds.push( bin.readUint  (data, offset+i*3 - 1) & 0x00ffffff );
			else if(offsize==4) for(var i=0; i<count; i++) inds.push( bin.readUint  (data, offset+i*4) );
			else if(count!=1) throw "unsupported offset size: " + offsize + ", count: " + count;

			offset += count*offsize;
			return offset-1;
		},

		getCharString : function(data, offset, o)
		{
			var bin = Typr["B"];

			var b0 = data[offset], b1 = data[offset+1], b2 = data[offset+2], b3 = data[offset+3], b4=data[offset+4];
			var vs = 1;
			var op=null, val=null;
			// operand
			if(b0<=20) { op = b0;  vs=1;  }
			if(b0==12) { op = b0*100+b1;  vs=2;  }
			//if(b0==19 || b0==20) { op = b0/*+" "+b1*/;  vs=2; }
			if(21 <=b0 && b0<= 27) { op = b0;  vs=1; }
			if(b0==28) { val = bin.readShort(data,offset+1);  vs=3; }
			if(29 <=b0 && b0<= 31) { op = b0;  vs=1; }
			if(32 <=b0 && b0<=246) { val = b0-139;  vs=1; }
			if(247<=b0 && b0<=250) { val = (b0-247)*256+b1+108;  vs=2; }
			if(251<=b0 && b0<=254) { val =-(b0-251)*256-b1-108;  vs=2; }
			if(b0==255) {  val = bin.readInt(data, offset+1)/0xffff;  vs=5;   }

			o.val = val!=null ? val : "o"+op;
			o.size = vs;
		},

		readCharString : function(data, offset, length)
		{
			var end = offset + length;
			var bin = Typr["B"];
			var arr = [];

			while(offset<end)
			{
				var b0 = data[offset], b1 = data[offset+1], b2 = data[offset+2], b3 = data[offset+3], b4=data[offset+4];
				var vs = 1;
				var op=null, val=null;
				// operand
				if(b0<=20) { op = b0;  vs=1;  }
				if(b0==12) { op = b0*100+b1;  vs=2;  }
				if(b0==19 || b0==20) { op = b0/*+" "+b1*/;  vs=2; }
				if(21 <=b0 && b0<= 27) { op = b0;  vs=1; }
				if(b0==28) { val = bin.readShort(data,offset+1);  vs=3; }
				if(29 <=b0 && b0<= 31) { op = b0;  vs=1; }
				if(32 <=b0 && b0<=246) { val = b0-139;  vs=1; }
				if(247<=b0 && b0<=250) { val = (b0-247)*256+b1+108;  vs=2; }
				if(251<=b0 && b0<=254) { val =-(b0-251)*256-b1-108;  vs=2; }
				if(b0==255) {  val = bin.readInt(data, offset+1)/0xffff;  vs=5;   }

				arr.push(val!=null ? val : "o"+op);
				offset += vs;

				//var cv = arr[arr.length-1];
				//if(cv==undefined) throw "error";
				//console.log()
			}
			return arr;
		},

		readDict : function(data, offset, end)
		{
			var bin = Typr["B"];
			//var dict = [];
			var dict = {};
			var carr = [];

			while(offset<end)
			{
				var b0 = data[offset], b1 = data[offset+1], b2 = data[offset+2], b3 = data[offset+3], b4=data[offset+4];
				var vs = 1;
				var key=null, val=null;
				// operand
				if(b0==28) { val = bin.readShort(data,offset+1);  vs=3; }
				if(b0==29) { val = bin.readInt  (data,offset+1);  vs=5; }
				if(32 <=b0 && b0<=246) { val = b0-139;  vs=1; }
				if(247<=b0 && b0<=250) { val = (b0-247)*256+b1+108;  vs=2; }
				if(251<=b0 && b0<=254) { val =-(b0-251)*256-b1-108;  vs=2; }
				if(b0==255) {  val = bin.readInt(data, offset+1)/0xffff;  vs=5;  throw "unknown number";  }

				if(b0==30)
				{
					var nibs = [];
					vs = 1;
					while(true)
					{
						var b = data[offset+vs];  vs++;
						var nib0 = b>>4, nib1 = b&0xf;
						if(nib0 != 0xf) nibs.push(nib0);  if(nib1!=0xf) nibs.push(nib1);
						if(nib1==0xf) break;
					}
					var s = "";
					var chars = [0,1,2,3,4,5,6,7,8,9,".","e","e-","reserved","-","endOfNumber"];
					for(var i=0; i<nibs.length; i++) s += chars[nibs[i]];
					//console.log(nibs);
					val = parseFloat(s);
				}

				if(b0<=21)	// operator
				{
					var keys = ["version", "Notice", "FullName", "FamilyName", "Weight", "FontBBox", "BlueValues", "OtherBlues", "FamilyBlues","FamilyOtherBlues",
						"StdHW", "StdVW", "escape", "UniqueID", "XUID", "charset", "Encoding", "CharStrings", "Private", "Subrs",
						"defaultWidthX", "nominalWidthX"];

					key = keys[b0];  vs=1;
					if(b0==12) {
						var keys = [ "Copyright", "isFixedPitch", "ItalicAngle", "UnderlinePosition", "UnderlineThickness", "PaintType", "CharstringType", "FontMatrix", "StrokeWidth", "BlueScale",
						"BlueShift", "BlueFuzz", "StemSnapH", "StemSnapV", "ForceBold", "","", "LanguageGroup", "ExpansionFactor", "initialRandomSeed",
						"SyntheticBase", "PostScript", "BaseFontName", "BaseFontBlend", "","","",  "","","",
						"ROS", "CIDFontVersion", "CIDFontRevision", "CIDFontType", "CIDCount", "UIDBase", "FDArray", "FDSelect", "FontName"];
						key = keys[b1];  vs=2;
					}
				}

				if(key!=null) {  dict[key] = carr.length==1 ? carr[0] : carr;  carr=[]; }
				else  carr.push(val);

				offset += vs;
			}
			return dict;
		}
	};


Typr["T"].cmap = {
	parseTab : function(data, offset, length)
	{
		var obj = {tables:[],ids:{},off:offset};
		data = new Uint8Array(data.buffer, offset, length);
		offset = 0;

		var offset0 = offset;
		var bin = Typr["B"], rU = bin.readUshort, cmap = Typr["T"].cmap;
		var version   = rU(data, offset);  offset += 2;
		var numTables = rU(data, offset);  offset += 2;

		//console.log(version, numTables);

		var offs = [];


		for(var i=0; i<numTables; i++)
		{
			var platformID = rU(data, offset);  offset += 2;
			var encodingID = rU(data, offset);  offset += 2;
			var noffset = bin.readUint(data, offset);       offset += 4;

			var id = "p"+platformID+"e"+encodingID;

			//console.log("cmap subtable", platformID, encodingID, noffset);


			var tind = offs.indexOf(noffset);

			if(tind==-1)
			{
				tind = obj.tables.length;
				var subt = {};
				offs.push(noffset);
				//var time = Date.now();
				var format = subt.format = rU(data, noffset);
				if     (format== 0) subt = cmap.parse0(data, noffset, subt);
				//else if(format== 2) subt.off = noffset;
				else if(format== 4) subt = cmap.parse4(data, noffset, subt);
				else if(format== 6) subt = cmap.parse6(data, noffset, subt);
				else if(format==12) subt = cmap.parse12(data,noffset, subt);
				//console.log(format, Date.now()-time);
				//else console.log("unknown format: "+format, platformID, encodingID, noffset);
				obj.tables.push(subt);
			}

			if(obj.ids[id]!=null) throw "multiple tables for one platform+encoding";
			obj.ids[id] = tind;
		}
		return obj;
	},

	parse0 : function(data, offset, obj)
	{
		var bin = Typr["B"];
		offset += 2;
		var len    = bin.readUshort(data, offset);  offset += 2;
		var lang   = bin.readUshort(data, offset);  offset += 2;
		obj.map = [];
		for(var i=0; i<len-6; i++) obj.map.push(data[offset+i]);
		return obj;
	},

	parse4 : function(data, offset, obj)
	{
		var bin = Typr["B"], rU = bin.readUshort, rUs = bin.readUshorts;
		var offset0 = offset;
		offset+=2;
		var length   = rU(data, offset);  offset+=2;
		var language = rU(data, offset);  offset+=2;
		var segCountX2 = rU(data, offset);  offset+=2;
		var segCount = segCountX2>>>1;
		obj.searchRange = rU(data, offset);  offset+=2;
		obj.entrySelector = rU(data, offset);  offset+=2;
		obj.rangeShift = rU(data, offset);  offset+=2;
		obj.endCount   = rUs(data, offset, segCount);  offset += segCount*2;
		offset+=2;
		obj.startCount = rUs(data, offset, segCount);  offset += segCount*2;
		obj.idDelta = [];
		for(var i=0; i<segCount; i++) {obj.idDelta.push(bin.readShort(data, offset));  offset+=2;}
		obj.idRangeOffset = rUs(data, offset, segCount);  offset += segCount*2;
		obj.glyphIdArray  = rUs(data, offset, ((offset0+length)-offset)>>>1);  //offset += segCount*2;
		return obj;
	},

	parse6 : function(data, offset, obj)
	{
		var bin = Typr["B"];
		var offset0 = offset;
		offset+=2;
		var length = bin.readUshort(data, offset);  offset+=2;
		var language = bin.readUshort(data, offset);  offset+=2;
		obj.firstCode = bin.readUshort(data, offset);  offset+=2;
		var entryCount = bin.readUshort(data, offset);  offset+=2;
		obj.glyphIdArray = [];
		for(var i=0; i<entryCount; i++) {obj.glyphIdArray.push(bin.readUshort(data, offset));  offset+=2;}

		return obj;
	},

	parse12 : function(data, offset, obj)
	{
		var bin = Typr["B"], rU = bin.readUint;
		var offset0 = offset;
		offset+=4;
		var length = rU(data, offset);  offset+=4;
		var lang   = rU(data, offset);  offset+=4;
		var nGroups= rU(data, offset)*3;  offset+=4;

		var gps = obj.groups = new Uint32Array(nGroups);//new Uint32Array(data.slice(offset, offset+nGroups*12).buffer);

		for(var i=0; i<nGroups; i+=3) {
			gps[i  ] = rU(data, offset+(i<<2)  );
			gps[i+1] = rU(data, offset+(i<<2)+4);
			gps[i+2] = rU(data, offset+(i<<2)+8);
		}
		return obj;
	}
};

Typr["T"].glyf = {
	parseTab : function(data, offset, length, font)
	{
		var obj = [], ng=font["maxp"]["numGlyphs"];
		for(var g=0; g<ng; g++) obj.push(null);
		return obj;
	},

	_parseGlyf : function(font, g)
	{
		var bin = Typr["B"];
		var data = font["_data"], loca=font["loca"];

		if(loca[g]==loca[g+1]) return null;

		var offset = Typr["findTable"](data, "glyf", font["_offset"])[0] + loca[g];

		var gl = {};

		gl.noc  = bin.readShort(data, offset);  offset+=2;		// number of contours
		gl.xMin = bin.readShort(data, offset);  offset+=2;
		gl.yMin = bin.readShort(data, offset);  offset+=2;
		gl.xMax = bin.readShort(data, offset);  offset+=2;
		gl.yMax = bin.readShort(data, offset);  offset+=2;

		if(gl.xMin>=gl.xMax || gl.yMin>=gl.yMax) return null;

		if(gl.noc>0)
		{
			gl.endPts = [];
			for(var i=0; i<gl.noc; i++) { gl.endPts.push(bin.readUshort(data,offset)); offset+=2; }

			var instructionLength = bin.readUshort(data,offset); offset+=2;
			if((data.length-offset)<instructionLength) return null;
			gl.instructions = bin.readBytes(data, offset, instructionLength);   offset+=instructionLength;

			var crdnum = gl.endPts[gl.noc-1]+1;
			gl.flags = [];
			for(var i=0; i<crdnum; i++ )
			{
				var flag = data[offset];  offset++;
				gl.flags.push(flag);
				if((flag&8)!=0)
				{
					var rep = data[offset];  offset++;
					for(var j=0; j<rep; j++) { gl.flags.push(flag); i++; }
				}
			}
			gl.xs = [];
			for(var i=0; i<crdnum; i++) {
				var i8=((gl.flags[i]&2)!=0), same=((gl.flags[i]&16)!=0);
				if(i8) { gl.xs.push(same ? data[offset] : -data[offset]);  offset++; }
				else
				{
					if(same) gl.xs.push(0);
					else { gl.xs.push(bin.readShort(data, offset));  offset+=2; }
				}
			}
			gl.ys = [];
			for(var i=0; i<crdnum; i++) {
				var i8=((gl.flags[i]&4)!=0), same=((gl.flags[i]&32)!=0);
				if(i8) { gl.ys.push(same ? data[offset] : -data[offset]);  offset++; }
				else
				{
					if(same) gl.ys.push(0);
					else { gl.ys.push(bin.readShort(data, offset));  offset+=2; }
				}
			}
			var x = 0, y = 0;
			for(var i=0; i<crdnum; i++) { x += gl.xs[i]; y += gl.ys[i];  gl.xs[i]=x;  gl.ys[i]=y; }
			//console.log(endPtsOfContours, instructionLength, instructions, flags, xCoordinates, yCoordinates);
		}
		else
		{
			var ARG_1_AND_2_ARE_WORDS	= 1<<0;
			var ARGS_ARE_XY_VALUES		= 1<<1;
			var ROUND_XY_TO_GRID		= 1<<2;
			var WE_HAVE_A_SCALE			= 1<<3;
			var RESERVED				= 1<<4;
			var MORE_COMPONENTS			= 1<<5;
			var WE_HAVE_AN_X_AND_Y_SCALE= 1<<6;
			var WE_HAVE_A_TWO_BY_TWO	= 1<<7;
			var WE_HAVE_INSTRUCTIONS	= 1<<8;
			var USE_MY_METRICS			= 1<<9;
			var OVERLAP_COMPOUND		= 1<<10;
			var SCALED_COMPONENT_OFFSET	= 1<<11;
			var UNSCALED_COMPONENT_OFFSET	= 1<<12;

			gl.parts = [];
			var flags;
			do {
				flags = bin.readUshort(data, offset);  offset += 2;
				var part = { m:{a:1,b:0,c:0,d:1,tx:0,ty:0}, p1:-1, p2:-1 };  gl.parts.push(part);
				part.glyphIndex = bin.readUshort(data, offset);  offset += 2;
				if ( flags & ARG_1_AND_2_ARE_WORDS) {
					var arg1 = bin.readShort(data, offset);  offset += 2;
					var arg2 = bin.readShort(data, offset);  offset += 2;
				} else {
					var arg1 = bin.readInt8(data, offset);  offset ++;
					var arg2 = bin.readInt8(data, offset);  offset ++;
				}

				if(flags & ARGS_ARE_XY_VALUES) { part.m.tx = arg1;  part.m.ty = arg2; }
				else  {  part.p1=arg1;  part.p2=arg2;  }
				//part.m.tx = arg1;  part.m.ty = arg2;
				//else { throw "params are not XY values"; }

				if ( flags & WE_HAVE_A_SCALE ) {
					part.m.a = part.m.d = bin.readF2dot14(data, offset);  offset += 2;
				} else if ( flags & WE_HAVE_AN_X_AND_Y_SCALE ) {
					part.m.a = bin.readF2dot14(data, offset);  offset += 2;
					part.m.d = bin.readF2dot14(data, offset);  offset += 2;
				} else if ( flags & WE_HAVE_A_TWO_BY_TWO ) {
					part.m.a = bin.readF2dot14(data, offset);  offset += 2;
					part.m.b = bin.readF2dot14(data, offset);  offset += 2;
					part.m.c = bin.readF2dot14(data, offset);  offset += 2;
					part.m.d = bin.readF2dot14(data, offset);  offset += 2;
				}
			} while ( flags & MORE_COMPONENTS )
			if (flags & WE_HAVE_INSTRUCTIONS){
				var numInstr = bin.readUshort(data, offset);  offset += 2;
				gl.instr = [];
				for(var i=0; i<numInstr; i++) { gl.instr.push(data[offset]);  offset++; }
			}
		}
		return gl;
	}
};

Typr["T"].head = {
	parseTab : function(data, offset, length)
	{
		var bin = Typr["B"];
		var obj = {};
		var tableVersion = bin.readFixed(data, offset);  offset += 4;

		obj["fontRevision"] = bin.readFixed(data, offset);  offset += 4;
		var checkSumAdjustment = bin.readUint(data, offset);  offset += 4;
		var magicNumber = bin.readUint(data, offset);  offset += 4;
		obj["flags"] = bin.readUshort(data, offset);  offset += 2;
		obj["unitsPerEm"] = bin.readUshort(data, offset);  offset += 2;
		obj["created"]  = bin.readUint64(data, offset);  offset += 8;
		obj["modified"] = bin.readUint64(data, offset);  offset += 8;
		obj["xMin"] = bin.readShort(data, offset);  offset += 2;
		obj["yMin"] = bin.readShort(data, offset);  offset += 2;
		obj["xMax"] = bin.readShort(data, offset);  offset += 2;
		obj["yMax"] = bin.readShort(data, offset);  offset += 2;
		obj["macStyle"] = bin.readUshort(data, offset);  offset += 2;
		obj["lowestRecPPEM"] = bin.readUshort(data, offset);  offset += 2;
		obj["fontDirectionHint"] = bin.readShort(data, offset);  offset += 2;
		obj["indexToLocFormat"]  = bin.readShort(data, offset);  offset += 2;
		obj["glyphDataFormat"]   = bin.readShort(data, offset);  offset += 2;
		return obj;
	}
};

Typr["T"].hhea = {
	parseTab : function(data, offset, length)
	{
		var bin = Typr["B"];
		var obj = {};
		var tableVersion = bin.readFixed(data, offset);  offset += 4;

		var keys = ["ascender","descender","lineGap",
			"advanceWidthMax","minLeftSideBearing","minRightSideBearing","xMaxExtent",
			"caretSlopeRise","caretSlopeRun","caretOffset",
			"res0","res1","res2","res3",
			"metricDataFormat","numberOfHMetrics" ];

		for(var i=0; i<	keys.length; i++) {
			var key = keys[i];
			var func = (key=="advanceWidthMax" || key=="numberOfHMetrics")?bin.readUshort:bin.readShort;
			obj[key]=func(data,offset+i*2);
		}
		return obj;
	}
};


Typr["T"].hmtx = {
	parseTab : function(data, offset, length, font)
	{
		var bin = Typr["B"];
		var aWidth = [];
		var lsBearing = [];

		var nG = font["maxp"]["numGlyphs"], nH = font["hhea"]["numberOfHMetrics"];
		var aw = 0, lsb = 0, i=0;
		while(i<nH) {  aw=bin.readUshort(data, offset+(i<<2));  lsb=bin.readShort(data, offset+(i<<2)+2);  aWidth.push(aw);  lsBearing.push(lsb);  i++;  }
		while(i<nG) {  aWidth.push(aw);  lsBearing.push(lsb);  i++;  }

		return {aWidth:aWidth, lsBearing:lsBearing};
	}
};


Typr["T"].kern = {
	parseTab : function(data, offset, length, font)
	{
		var bin = Typr["B"], kern=Typr["T"].kern;

		var version = bin.readUshort(data, offset);
		if(version==1) return kern.parseV1(data, offset, length, font);
		var nTables = bin.readUshort(data, offset+2);  offset+=4;

		var map = {glyph1: [], rval:[]};
		for(var i=0; i<nTables; i++)
		{
			offset+=2;	// skip version
			var length  = bin.readUshort(data, offset);  offset+=2;
			var coverage = bin.readUshort(data, offset);  offset+=2;
			var format = coverage>>>8;
			/* I have seen format 128 once, that's why I do */ format &= 0xf;
			if(format==0) offset = kern.readFormat0(data, offset, map);
			//else throw "unknown kern table format: "+format;
		}
		return map;
	},

	parseV1 : function(data, offset, length, font)
	{
		var bin = Typr["B"], kern=Typr["T"].kern;

		var version = bin.readFixed(data, offset);   // 0x00010000
		var nTables = bin.readUint (data, offset+4);  offset+=8;

		var map = {glyph1: [], rval:[]};
		for(var i=0; i<nTables; i++)
		{
			var length = bin.readUint(data, offset);   offset+=4;
			var coverage = bin.readUshort(data, offset);  offset+=2;
			var tupleIndex = bin.readUshort(data, offset);  offset+=2;
			var format = coverage&0xff;
			if(format==0) offset = kern.readFormat0(data, offset, map);
			//else throw "unknown kern table format: "+format;
		}
		return map;
	},

	readFormat0 : function(data, offset, map)
	{
		var bin = Typr["B"], rUs = bin.readUshort;
		var pleft = -1;
		var nPairs        = rUs(data, offset);
		var searchRange   = rUs(data, offset+2);
		var entrySelector = rUs(data, offset+4);
		var rangeShift    = rUs(data, offset+6);  offset+=8;
		for(var j=0; j<nPairs; j++)
		{
			var left  = rUs(data, offset);  offset+=2;
			var right = rUs(data, offset);  offset+=2;
			var value = bin.readShort (data, offset);  offset+=2;
			if(left!=pleft) { map.glyph1.push(left);  map.rval.push({ glyph2:[], vals:[] }) }
			var rval = map.rval[map.rval.length-1];
			rval.glyph2.push(right);   rval.vals.push(value);
			pleft = left;
		}
		return offset;
	}
};


Typr["T"].loca = {
	parseTab : function(data, offset, length, font)
	{
		var bin = Typr["B"];
		var obj = [];

		var ver = font["head"]["indexToLocFormat"];
		var len = font["maxp"]["numGlyphs"]+1;

		if(ver==0) for(var i=0; i<len; i++) obj.push(bin.readUshort(data, offset+(i<<1))<<1);
		if(ver==1) for(var i=0; i<len; i++) obj.push(bin.readUint  (data, offset+(i<<2))   );

		return obj;
	}
};


Typr["T"].maxp = {
	parseTab : function(data, offset, length)
	{
		//console.log(data.length, offset, length);

		var bin = Typr["B"], rU=bin.readUshort;
		var obj = {};

		// both versions 0.5 and 1.0
		var ver = bin.readUint(data, offset); offset += 4;

		obj["numGlyphs"] = rU(data, offset);  offset += 2;

		// only 1.0
		/*
		if(ver == 0x00010000) {
			obj.maxPoints             = rU(data, offset);  offset += 2;
			obj.maxContours           = rU(data, offset);  offset += 2;
			obj.maxCompositePoints    = rU(data, offset);  offset += 2;
			obj.maxCompositeContours  = rU(data, offset);  offset += 2;
			obj.maxZones              = rU(data, offset);  offset += 2;
			obj.maxTwilightPoints     = rU(data, offset);  offset += 2;
			obj.maxStorage            = rU(data, offset);  offset += 2;
			obj.maxFunctionDefs       = rU(data, offset);  offset += 2;
			obj.maxInstructionDefs    = rU(data, offset);  offset += 2;
			obj.maxStackElements      = rU(data, offset);  offset += 2;
			obj.maxSizeOfInstructions = rU(data, offset);  offset += 2;
			obj.maxComponentElements  = rU(data, offset);  offset += 2;
			obj.maxComponentDepth     = rU(data, offset);  offset += 2;
		}
		*/

		return obj;
	}
};


Typr["T"].name = {
	parseTab : function(data, offset, length)
	{
		var bin = Typr["B"];
		var obj = {};
		var format = bin.readUshort(data, offset);  offset += 2;
		var count  = bin.readUshort(data, offset);  offset += 2;
		var stringOffset = bin.readUshort(data, offset);  offset += 2;

		//console.log(format,count);

		var names = [
			"copyright",
			"fontFamily",
			"fontSubfamily",
			"ID",
			"fullName",
			"version",
			"postScriptName",
			"trademark",
			"manufacturer",
			"designer",
			"description",
			"urlVendor",
			"urlDesigner",
			"licence",
			"licenceURL",
			"---",
			"typoFamilyName",
			"typoSubfamilyName",
			"compatibleFull",
			"sampleText",
			"postScriptCID",
			"wwsFamilyName",
			"wwsSubfamilyName",
			"lightPalette",
			"darkPalette"
		];

		var offset0 = offset;
		var rU = bin.readUshort;

		for(var i=0; i<count; i++)
		{
			var platformID = rU(data, offset);  offset += 2;
			var encodingID = rU(data, offset);  offset += 2;
			var languageID = rU(data, offset);  offset += 2;
			var nameID     = rU(data, offset);  offset += 2;
			var slen       = rU(data, offset);  offset += 2;
			var noffset    = rU(data, offset);  offset += 2;
			//console.log(platformID, encodingID, languageID.toString(16), nameID, length, noffset);


			var soff = offset0 + count*12 + noffset;
			var str;
			if(false){}
			else if(platformID == 0) str = bin.readUnicode(data, soff, slen/2);
			else if(platformID == 3 && encodingID == 0) str = bin.readUnicode(data, soff, slen/2);
			else if(encodingID == 0) str = bin.readASCII  (data, soff, slen);
			else if(encodingID == 1) str = bin.readUnicode(data, soff, slen/2);
			else if(encodingID == 3) str = bin.readUnicode(data, soff, slen/2);
			else if(encodingID == 4) str = bin.readUnicode(data, soff, slen/2);
			else if(encodingID ==10) str = bin.readUnicode(data, soff, slen/2);

			else if(platformID == 1) { str = bin.readASCII(data, soff, slen);  console.log("reading unknown MAC encoding "+encodingID+" as ASCII") }
			else {
				console.log("unknown encoding "+encodingID + ", platformID: "+platformID);
				str = bin.readASCII(data, soff, slen);
			}

			var tid = "p"+platformID+","+(languageID).toString(16);//Typr._platforms[platformID];
			if(obj[tid]==null) obj[tid] = {};
			obj[tid][names[nameID]] = str;
			obj[tid]["_lang"] = languageID;
			//console.log(tid, obj[tid]);
		}
		/*
		if(format == 1)
		{
			var langTagCount = bin.readUshort(data, offset);  offset += 2;
			for(var i=0; i<langTagCount; i++)
			{
				var length  = bin.readUshort(data, offset);  offset += 2;
				var noffset = bin.readUshort(data, offset);  offset += 2;
			}
		}
		*/

		//console.log(obj);
		var psn = "postScriptName";

		for(var p in obj) if(obj[p][psn]!=null && obj[p]["_lang"]==0x0409) return obj[p];		// United States
		for(var p in obj) if(obj[p][psn]!=null && obj[p]["_lang"]==0x0000) return obj[p];		// Universal
		for(var p in obj) if(obj[p][psn]!=null && obj[p]["_lang"]==0x0c0c) return obj[p];		// Canada
		for(var p in obj) if(obj[p][psn]!=null) return obj[p];

		var out;
		for(var p in obj) { out=obj[p]; break; }
		console.log("returning name table with languageID "+ out._lang);
		if(out[psn]==null && out["ID"]!=null) out[psn]=out["ID"];
		return out;
	}
}

Typr["T"].OS2 = {
	parseTab : function(data, offset, length)
	{
		var bin = Typr["B"];
		var ver = bin.readUshort(data, offset); offset += 2;

		var OS2 = Typr["T"].OS2;

		var obj = {};
		if     (ver==0) OS2.version0(data, offset, obj);
		else if(ver==1) OS2.version1(data, offset, obj);
		else if(ver==2 || ver==3 || ver==4) OS2.version2(data, offset, obj);
		else if(ver==5) OS2.version5(data, offset, obj);
		else throw "unknown OS/2 table version: "+ver;

		return obj;
	},

	version0 : function(data, offset, obj)
	{
		var bin = Typr["B"];
		obj["xAvgCharWidth"] = bin.readShort(data, offset); offset += 2;
		obj["usWeightClass"] = bin.readUshort(data, offset); offset += 2;
		obj["usWidthClass"]  = bin.readUshort(data, offset); offset += 2;
		obj["fsType"] = bin.readUshort(data, offset); offset += 2;
		obj["ySubscriptXSize"] = bin.readShort(data, offset); offset += 2;
		obj["ySubscriptYSize"] = bin.readShort(data, offset); offset += 2;
		obj["ySubscriptXOffset"] = bin.readShort(data, offset); offset += 2;
		obj["ySubscriptYOffset"] = bin.readShort(data, offset); offset += 2;
		obj["ySuperscriptXSize"] = bin.readShort(data, offset); offset += 2;
		obj["ySuperscriptYSize"] = bin.readShort(data, offset); offset += 2;
		obj["ySuperscriptXOffset"] = bin.readShort(data, offset); offset += 2;
		obj["ySuperscriptYOffset"] = bin.readShort(data, offset); offset += 2;
		obj["yStrikeoutSize"] = bin.readShort(data, offset); offset += 2;
		obj["yStrikeoutPosition"] = bin.readShort(data, offset); offset += 2;
		obj["sFamilyClass"] = bin.readShort(data, offset); offset += 2;
		obj["panose"] = bin.readBytes(data, offset, 10);  offset += 10;
		obj["ulUnicodeRange1"]	= bin.readUint(data, offset);  offset += 4;
		obj["ulUnicodeRange2"]	= bin.readUint(data, offset);  offset += 4;
		obj["ulUnicodeRange3"]	= bin.readUint(data, offset);  offset += 4;
		obj["ulUnicodeRange4"]	= bin.readUint(data, offset);  offset += 4;
		obj["achVendID"] = bin.readASCII(data, offset, 4);  offset += 4;
		obj["fsSelection"]	 = bin.readUshort(data, offset); offset += 2;
		obj["usFirstCharIndex"] = bin.readUshort(data, offset); offset += 2;
		obj["usLastCharIndex"] = bin.readUshort(data, offset); offset += 2;
		obj["sTypoAscender"] = bin.readShort(data, offset); offset += 2;
		obj["sTypoDescender"] = bin.readShort(data, offset); offset += 2;
		obj["sTypoLineGap"] = bin.readShort(data, offset); offset += 2;
		obj["usWinAscent"] = bin.readUshort(data, offset); offset += 2;
		obj["usWinDescent"] = bin.readUshort(data, offset); offset += 2;
		return offset;
	},

	version1 : function(data, offset, obj)
	{
		var bin = Typr["B"];
		offset = Typr["T"].OS2.version0(data, offset, obj);

		obj["ulCodePageRange1"] = bin.readUint(data, offset); offset += 4;
		obj["ulCodePageRange2"] = bin.readUint(data, offset); offset += 4;
		return offset;
	},

	version2 : function(data, offset, obj)
	{
		var bin = Typr["B"], rU=bin.readUshort;
		offset = Typr["T"].OS2.version1(data, offset, obj);

		obj["sxHeight"]     = bin.readShort(data, offset); offset += 2;
		obj["sCapHeight"]   = bin.readShort(data, offset); offset += 2;
		obj["usDefault"]    = rU(data, offset); offset += 2;
		obj["usBreak"]      = rU(data, offset); offset += 2;
		obj["usMaxContext"] = rU(data, offset); offset += 2;
		return offset;
	},

	version5 : function(data, offset, obj)
	{
		var rU = Typr["B"].readUshort;
		offset = Typr["T"].OS2.version2(data, offset, obj);

		obj["usLowerOpticalPointSize"] = rU(data, offset); offset += 2;
		obj["usUpperOpticalPointSize"] = rU(data, offset); offset += 2;
		return offset;
	}
}

Typr["T"].post = {
	parseTab : function(data, offset, length)
	{
		var bin = Typr["B"];
		var obj = {};

		obj["version"]            = bin.readFixed(data, offset);  offset+=4;
		obj["italicAngle"]        = bin.readFixed(data, offset);  offset+=4;
		obj["underlinePosition"]  = bin.readShort(data, offset);  offset+=2;
		obj["underlineThickness"] = bin.readShort(data, offset);  offset+=2;

		return obj;
	}
};
Typr["T"].SVG = {
	parseTab : function(data, offset, length)
	{
		var bin = Typr["B"];
		var obj = { entries: []};

		var offset0 = offset;

		var tableVersion = bin.readUshort(data, offset);	offset += 2;
		var svgDocIndexOffset = bin.readUint(data, offset);	offset += 4;
		var reserved = bin.readUint(data, offset); offset += 4;

		offset = svgDocIndexOffset + offset0;

		var numEntries = bin.readUshort(data, offset);	offset += 2;

		for(var i=0; i<numEntries; i++)
		{
			var startGlyphID = bin.readUshort(data, offset);  offset += 2;
			var endGlyphID   = bin.readUshort(data, offset);  offset += 2;
			var svgDocOffset = bin.readUint  (data, offset);  offset += 4;
			var svgDocLength = bin.readUint  (data, offset);  offset += 4;

			var sbuf = new Uint8Array(data.buffer, offset0 + svgDocOffset + svgDocIndexOffset, svgDocLength);
			var svg = bin.readUTF8(sbuf, 0, sbuf.length);

			for(var f=startGlyphID; f<=endGlyphID; f++) {
				obj.entries[f] = svg;
			}
		}
		return obj;
	}
};

  /* ===== End embedded Typr.js ===== */

  /* ===== Begin embedded Typr.U.js (upstream readable source) ===== */


Typr["U"] = {
	"shape" : function(font,str,ltr) {

		var getGlyphPosition = function(font, gls,i1,ltr)
		{
			var g1=gls[i1],g2=gls[i1+1], kern=font["kern"];
			if(kern) {
				var ind1 = kern.glyph1.indexOf(g1);
				if(ind1!=-1)
				{
					var ind2 = kern.rval[ind1].glyph2.indexOf(g2);
					if(ind2!=-1) return [0,0,kern.rval[ind1].vals[ind2],0];
				}
			}
			//console.log("no kern");
			return [0,0,0,0];
		}


		var gls = [];
		for(var i=0; i<str.length; i++) {
			var cc = str.codePointAt(i);  if(cc>0xffff) i++;
			gls.push(Typr["U"]["codeToGlyph"](font, cc));
		}
		var shape = [];
		var x = 0, y = 0;

		for(var i=0; i<gls.length; i++) {
			var padj = getGlyphPosition(font, gls,i,ltr);
			var gid = gls[i];
			var ax=font["hmtx"].aWidth[gid]+padj[2];
			shape.push({"g":gid, "cl":i, "dx":0, "dy":0, "ax":ax, "ay":0});
			x+=ax;
		}
		return shape;
	},

	"shapeToPath" : function(font,shape,clr) {
		var tpath = {cmds:[], crds:[]};
		var x = 0, y = 0;

		for(var i=0; i<shape.length; i++) {
			var it = shape[i]
			var path = Typr["U"]["glyphToPath"](font, it["g"]), crds=path["crds"];
			for(var j=0; j<crds.length; j+=2) {
				tpath.crds.push(crds[j  ] + x + it["dx"]);
				tpath.crds.push(crds[j+1] + y + it["dy"]);
			}
			if(clr) tpath.cmds.push(clr);
			for(var j=0; j<path["cmds"].length; j++) tpath.cmds.push(path["cmds"][j]);
			var clen = tpath.cmds.length;
			if(clr) if(clen!=0 && tpath.cmds[clen-1]!="X") tpath.cmds.push("X");  // SVG fonts might contain "X". Then, nothing would stroke non-SVG glyphs.

			x += it["ax"];  y+= it["ay"];
		}
		return {"cmds":tpath.cmds, "crds":tpath.crds};
	},

	"codeToGlyph" : function(font, code)
	{
		var cmap = font["cmap"];
		//console.log(cmap);
		// "p3e10" for NotoEmoji-Regular.ttf
		var tind = -1, pps=["p3e10","p0e4","p3e1","p1e0","p0e3","p0e1"/*,"p3e3"*/];
		for(var i=0; i<pps.length; i++) if(cmap.ids[pps[i]]!=null) {  tind=cmap.ids[pps[i]];  break;  }
		if(tind==-1) throw "no familiar platform and encoding!";


		// find the greatest index with a value <=v
		var arrSearch = function(arr, k, v) {
			var l=0, r=Math.floor(arr.length/k);
			while(l+1!=r) {  var mid = l + ((r-l)>>>1);   if(arr[mid*k]<=v) l=mid;  else r=mid;  }
			return l*k;
		}

		var tab = cmap.tables[tind], fmt=tab.format, gid = -1;  //console.log(fmt); throw "e";

		if(fmt==0) {
			if(code>=tab.map.length) gid = 0;
			else gid = tab.map[code];
		}
		/*else if(fmt==2) {
			var data=font["_data"], off = cmap.off+tab.off+6, bin=Typr["B"];
			var shKey = bin.readUshort(data,off + 2*(code>>>8));
			var shInd = off + 256*2 + shKey*8;

			var firstCode = bin.readUshort(data,shInd);
			var entryCount= bin.readUshort(data,shInd+2);
			var idDelta   = bin.readShort (data,shInd+4);
			var idRangeOffset = bin.readUshort(data,shInd+6);

			if(firstCode<=code && code<=firstCode+entryCount) {
				// not completely correct
				gid = bin.readUshort(data, shInd+6+idRangeOffset + (code&255)*2);
			}
			else gid=0;
			//if(code>256) console.log(code,(code>>>8),shKey,firstCode,entryCount,idDelta,idRangeOffset);

			//throw "e";
			//console.log(tab,  bin.readUshort(data,off));
			//throw "e";
		}*/
		else if(fmt==4) {
			var sind = -1, ec = tab.endCount;
			if(code>ec[ec.length-1]) sind=-1;
			else {
				// smallest index with code <= value
				sind = arrSearch(ec,1,code);
				if(ec[sind]<code) sind++;
			}
			if(sind==-1) gid = 0;
			else if(code<tab.startCount[sind]) gid = 0;
			else {
				var gli = 0;
				if(tab.idRangeOffset[sind]!=0) gli = tab.glyphIdArray[(code-tab.startCount[sind]) + (tab.idRangeOffset[sind]>>1) - (tab.idRangeOffset.length-sind)];
				else                           gli = code + tab.idDelta[sind];
				gid = (gli & 0xFFFF);
			}
		}
		else if(fmt==6) {
			var off = code-tab.firstCode, arr=tab.glyphIdArray;
			if(off<0 || off>=arr.length) gid=0;
			else gid = arr[off];
		}
		else if(fmt==12) {
			var grp = tab.groups;  //console.log(grp);  throw "e";

			if(code>grp[grp.length-2]) gid = 0;
			else {
				var i = arrSearch(grp,3,code);
				if(grp[i]<=code && code<=grp[i+1]) {  gid = grp[i+2] + (code-grp[i]);  }
				if(gid==-1) gid=0;
			}
		}
		else throw "unknown cmap table format "+tab.format;

		//*
		var SVG = font["SVG "], loca = font["loca"];
		// if the font claims to have a Glyph for a character, but the glyph is empty, and the character is not "white", it is a lie!
		if(gid!=0 && font["CFF "]==null && (SVG==null || SVG.entries[gid]==null) && loca[gid]==loca[gid+1]  // loca not present in CFF or SVG fonts
			&& [0x9,0xa,0xb,0xc,0xd,0x20,0x85,0xa0,0x1680,0x2028,0x2029,0x202f,0x3000,
				0x180e,0x200b,0x200c,0x200d,0x2060,0xfeff].indexOf(code)==-1 && !(0x2000<=code && code<=0x200a))  gid=0;
		//*/

		return gid;
	},

	"glyphToPath" : function(font, gid)
	{
		var path = { cmds:[], crds:[] };
		var SVG = font["SVG "], CFF = font["CFF "];
		var U = Typr["U"];
		if(SVG && SVG.entries[gid]) {
			var p = SVG.entries[gid];
			if(p!=null) {
				if(typeof p == "string") {  p = U["SVG"].toPath(p);  SVG.entries[gid]=p;  }
				path=p;
			}
		}
		else if(CFF) {
			var pdct = CFF["Private"];
			var state = {x:0,y:0,stack:[],nStems:0,haveWidth:false,width: pdct ? pdct["defaultWidthX"] : 0,open:false};
			if(CFF["ROS"]) {
				var gi = 0;
				while(CFF["FDSelect"][gi+2]<=gid) gi+=2;
				pdct = CFF["FDArray"][CFF["FDSelect"][gi+1]]["Private"];
			}
			U["_drawCFF"](CFF["CharStrings"][gid], state, CFF, pdct, path);
		}
		else if(font["glyf"]) {  U["_drawGlyf"](gid, font, path);  }
		return {"cmds":path.cmds, "crds":path.crds};
	},

	"_drawGlyf" : function(gid, font, path)
	{
		var gl = font["glyf"][gid];
		if(gl==null) gl = font["glyf"][gid] = Typr["T"].glyf._parseGlyf(font, gid);
		if(gl!=null){
			if(gl.noc>-1) Typr["U"]["_simpleGlyph"](gl, path);
			else          Typr["U"]["_compoGlyph"] (gl, font, path);
		}
	},
	"_simpleGlyph" : function(gl, p)
	{
		var P = Typr["U"]["P"];
		for(var c=0; c<gl.noc; c++) {
			var i0 = (c==0) ? 0 : (gl.endPts[c-1] + 1);
			var il = gl.endPts[c];

			for(var i=i0; i<=il; i++) {
				var pr = (i==i0)?il:(i-1);
				var nx = (i==il)?i0:(i+1);
				var onCurve = gl.flags[i]&1;
				var prOnCurve = gl.flags[pr]&1;
				var nxOnCurve = gl.flags[nx]&1;

				var x = gl.xs[i], y = gl.ys[i];

				if(i==i0) {
					if(onCurve) {
						if(prOnCurve) P.MoveTo(p, gl.xs[pr], gl.ys[pr]);
						else          {  P.MoveTo(p,x,y);  continue;  /*  will do CurveTo at il  */  }
					}
					else {
						if(prOnCurve) P.MoveTo(p,  gl.xs[pr],       gl.ys[pr]        );
						else          P.MoveTo(p, Math.floor((gl.xs[pr]+x)*0.5), Math.floor((gl.ys[pr]+y)*0.5)   );
					}
				}
				if(onCurve) {
					if(prOnCurve) P.LineTo(p,x,y);
				}
				else {
					if(nxOnCurve) P.qCurveTo(p, x, y, gl.xs[nx], gl.ys[nx]);
					else          P.qCurveTo(p, x, y, Math.floor((x+gl.xs[nx])*0.5), Math.floor((y+gl.ys[nx])*0.5) );
				}
			}
			P.ClosePath(p);
		}
	},
	"_compoGlyph" : function(gl, font, p) {
		for(var j=0; j<gl.parts.length; j++) {
			var path = { cmds:[], crds:[] };
			var prt = gl.parts[j];
			Typr["U"]["_drawGlyf"](prt.glyphIndex, font, path);

			var m = prt.m;
			for(var i=0; i<path.crds.length; i+=2) {
				var x = path.crds[i  ], y = path.crds[i+1];
				p.crds.push(x*m.a + y*m.b + m.tx);
				p.crds.push(x*m.c + y*m.d + m.ty);
			}
			for(var i=0; i<path.cmds.length; i++) p.cmds.push(path.cmds[i]);
		}
	},

	"pathToSVG" : function(path, prec)
	{
		var cmds = path["cmds"], crds = path["crds"];
		if(prec==null) prec = 5;
		var out = [], co = 0, lmap = {"M":2,"L":2,"Q":4,"C":6};
		for(var i=0; i<cmds.length; i++)
		{
			var cmd = cmds[i], cn = co+(lmap[cmd]?lmap[cmd]:0);
			out.push(cmd);
			while(co<cn) {  var c = crds[co++];  out.push(parseFloat(c.toFixed(prec))+(co==cn?"":" "));  }
		}
		return out.join("");
	},
	"SVGToPath" : function(d) {
		var pth = {cmds:[], crds:[]};
		Typr["U"]["SVG"].svgToPath(d, pth);
		return {"cmds":pth.cmds, "crds":pth.crds};
	},

	"pathToContext" : function(path, ctx) {
		var c = 0, cmds = path["cmds"], crds = path["crds"];

		for(var j=0; j<cmds.length; j++) {
			var cmd = cmds[j];
			if     (cmd=="M") {
				ctx.moveTo(crds[c], crds[c+1]);
				c+=2;
			}
			else if(cmd=="L") {
				ctx.lineTo(crds[c], crds[c+1]);
				c+=2;
			}
			else if(cmd=="C") {
				ctx.bezierCurveTo(crds[c], crds[c+1], crds[c+2], crds[c+3], crds[c+4], crds[c+5]);
				c+=6;
			}
			else if(cmd=="Q") {
				ctx.quadraticCurveTo(crds[c], crds[c+1], crds[c+2], crds[c+3]);
				c+=4;
			}
			else if(cmd.charAt(0)=="#") {
				ctx.beginPath();
				ctx.fillStyle = cmd;
			}
			else if(cmd=="Z") {
				ctx.closePath();
			}
			else if(cmd=="X") {
				ctx.fill();
			}
		}
	},

	"P" : {
		MoveTo    : function(p, x, y)        {  p.cmds.push("M");  p.crds.push(x,y);  },
		LineTo    : function(p, x, y)        {  p.cmds.push("L");  p.crds.push(x,y);  },
		CurveTo   : function(p, a,b,c,d,e,f) {  p.cmds.push("C");  p.crds.push(a,b,c,d,e,f);  },
		qCurveTo  : function(p, a,b,c,d)     {  p.cmds.push("Q");  p.crds.push(a,b,c,d);  },
		ClosePath : function(p)              {  p.cmds.push("Z");  }
	},

	"_drawCFF" : function(cmds, state, font, pdct, p)
	{
		var stack = state.stack;
		var nStems = state.nStems, haveWidth=state.haveWidth, width=state.width, open=state.open;
		var i=0;
		var x=state.x, y=state.y, c1x=0, c1y=0, c2x=0, c2y=0, c3x=0, c3y=0, c4x=0, c4y=0, jpx=0, jpy=0;
		var CFF = Typr["T"].CFF, P = Typr["U"]["P"];

		var nominalWidthX = pdct["nominalWidthX"];
		var o = {val:0,size:0};
		//console.log(cmds);
		while(i<cmds.length)
		{
			CFF.getCharString(cmds, i, o);
			var v = o.val;
			i += o.size;

			if(false) {}
			else if(v=="o1" || v=="o18")  //  hstem || hstemhm
			{
				var hasWidthArg;

				// The number of stem operators on the stack is always even.
				// If the value is uneven, that means a width is specified.
				hasWidthArg = stack.length % 2 !== 0;
				if (hasWidthArg && !haveWidth) {
					width = stack.shift() + nominalWidthX;
				}

				nStems += stack.length >> 1;
				stack.length = 0;
				haveWidth = true;
			}
			else if(v=="o3" || v=="o23")  // vstem || vstemhm
			{
				var hasWidthArg;

				// The number of stem operators on the stack is always even.
				// If the value is uneven, that means a width is specified.
				hasWidthArg = stack.length % 2 !== 0;
				if (hasWidthArg && !haveWidth) {
					width = stack.shift() + nominalWidthX;
				}

				nStems += stack.length >> 1;
				stack.length = 0;
				haveWidth = true;
			}
			else if(v=="o4")
			{
				if (stack.length > 1 && !haveWidth) {
							width = stack.shift() + nominalWidthX;
							haveWidth = true;
						}
				if(open) P.ClosePath(p);

						y += stack.pop();
						P.MoveTo(p,x,y);   open=true;
			}
			else if(v=="o5")
			{
				while (stack.length > 0) {
							x += stack.shift();
							y += stack.shift();
							P.LineTo(p, x, y);
						}
			}
			else if(v=="o6" || v=="o7")  // hlineto || vlineto
			{
				var count = stack.length;
				var isX = (v == "o6");

				for(var j=0; j<count; j++) {
					var sval = stack.shift();

					if(isX) x += sval;  else  y += sval;
					isX = !isX;
					P.LineTo(p, x, y);
				}
			}
			else if(v=="o8" || v=="o24")	// rrcurveto || rcurveline
			{
				var count = stack.length;
				var index = 0;
				while(index+6 <= count) {
					c1x = x + stack.shift();
					c1y = y + stack.shift();
					c2x = c1x + stack.shift();
					c2y = c1y + stack.shift();
					x = c2x + stack.shift();
					y = c2y + stack.shift();
					P.CurveTo(p, c1x, c1y, c2x, c2y, x, y);
					index+=6;
				}
				if(v=="o24")
				{
					x += stack.shift();
					y += stack.shift();
					P.LineTo(p, x, y);
				}
			}
			else if(v=="o11")  break;
			else if(v=="o1234" || v=="o1235" || v=="o1236" || v=="o1237")//if((v+"").slice(0,3)=="o12")
			{
				if(v=="o1234")
				{
					c1x = x   + stack.shift();    // dx1
					c1y = y;                      // dy1
					c2x = c1x + stack.shift();    // dx2
					c2y = c1y + stack.shift();    // dy2
					jpx = c2x + stack.shift();    // dx3
					jpy = c2y;                    // dy3
					c3x = jpx + stack.shift();    // dx4
					c3y = c2y;                    // dy4
					c4x = c3x + stack.shift();    // dx5
					c4y = y;                      // dy5
					x = c4x + stack.shift();      // dx6
					P.CurveTo(p, c1x, c1y, c2x, c2y, jpx, jpy);
					P.CurveTo(p, c3x, c3y, c4x, c4y, x, y);

				}
				if(v=="o1235")
				{
					c1x = x   + stack.shift();    // dx1
					c1y = y   + stack.shift();    // dy1
					c2x = c1x + stack.shift();    // dx2
					c2y = c1y + stack.shift();    // dy2
					jpx = c2x + stack.shift();    // dx3
					jpy = c2y + stack.shift();    // dy3
					c3x = jpx + stack.shift();    // dx4
					c3y = jpy + stack.shift();    // dy4
					c4x = c3x + stack.shift();    // dx5
					c4y = c3y + stack.shift();    // dy5
					x = c4x + stack.shift();      // dx6
					y = c4y + stack.shift();      // dy6
					stack.shift();                // flex depth
					P.CurveTo(p, c1x, c1y, c2x, c2y, jpx, jpy);
					P.CurveTo(p, c3x, c3y, c4x, c4y, x, y);
				}
				if(v=="o1236")
				{
					c1x = x   + stack.shift();    // dx1
					c1y = y   + stack.shift();    // dy1
					c2x = c1x + stack.shift();    // dx2
					c2y = c1y + stack.shift();    // dy2
					jpx = c2x + stack.shift();    // dx3
					jpy = c2y;                    // dy3
					c3x = jpx + stack.shift();    // dx4
					c3y = c2y;                    // dy4
					c4x = c3x + stack.shift();    // dx5
					c4y = c3y + stack.shift();    // dy5
					x = c4x + stack.shift();      // dx6
					P.CurveTo(p, c1x, c1y, c2x, c2y, jpx, jpy);
					P.CurveTo(p, c3x, c3y, c4x, c4y, x, y);
				}
				if(v=="o1237")
				{
					c1x = x   + stack.shift();    // dx1
					c1y = y   + stack.shift();    // dy1
					c2x = c1x + stack.shift();    // dx2
					c2y = c1y + stack.shift();    // dy2
					jpx = c2x + stack.shift();    // dx3
					jpy = c2y + stack.shift();    // dy3
					c3x = jpx + stack.shift();    // dx4
					c3y = jpy + stack.shift();    // dy4
					c4x = c3x + stack.shift();    // dx5
					c4y = c3y + stack.shift();    // dy5
					if (Math.abs(c4x - x) > Math.abs(c4y - y)) {
						x = c4x + stack.shift();
					} else {
						y = c4y + stack.shift();
					}
					P.CurveTo(p, c1x, c1y, c2x, c2y, jpx, jpy);
					P.CurveTo(p, c3x, c3y, c4x, c4y, x, y);
				}
			}
			else if(v=="o14")
			{
				if (stack.length > 0 && !haveWidth) {
							width = stack.shift() + font["nominalWidthX"];
							haveWidth = true;
						}
				if(stack.length==4) // seac = standard encoding accented character
				{

					var asb = 0;
					var adx = stack.shift();
					var ady = stack.shift();
					var bchar = stack.shift();
					var achar = stack.shift();


					var bind = CFF.glyphBySE(font, bchar);
					var aind = CFF.glyphBySE(font, achar);

					//console.log(bchar, bind);
					//console.log(achar, aind);
					//state.x=x; state.y=y; state.nStems=nStems; state.haveWidth=haveWidth; state.width=width;  state.open=open;

					Typr["U"]["_drawCFF"](font["CharStrings"][bind], state,font,pdct,p);
					state.x = adx; state.y = ady;
					Typr["U"]["_drawCFF"](font["CharStrings"][aind], state,font,pdct,p);

					//x=state.x; y=state.y; nStems=state.nStems; haveWidth=state.haveWidth; width=state.width;  open=state.open;
				}
				if(open) {  P.ClosePath(p);  open=false;  }
			}
			else if(v=="o19" || v=="o20")
			{
				var hasWidthArg;

				// The number of stem operators on the stack is always even.
				// If the value is uneven, that means a width is specified.
				hasWidthArg = stack.length % 2 !== 0;
				if (hasWidthArg && !haveWidth) {
					width = stack.shift() + nominalWidthX;
				}

				nStems += stack.length >> 1;
				stack.length = 0;
				haveWidth = true;

				i += (nStems + 7) >> 3;
			}

			else if(v=="o21") {
				if (stack.length > 2 && !haveWidth) {
							width = stack.shift() + nominalWidthX;
							haveWidth = true;
						}

						y += stack.pop();
						x += stack.pop();

						if(open) P.ClosePath(p);
						P.MoveTo(p,x,y);   open=true;
			}
			else if(v=="o22")
			{
				 if (stack.length > 1 && !haveWidth) {
							width = stack.shift() + nominalWidthX;
							haveWidth = true;
						}

						x += stack.pop();

						if(open) P.ClosePath(p);
						P.MoveTo(p,x,y);   open=true;
			}
			else if(v=="o25")
			{
				while (stack.length > 6) {
							x += stack.shift();
							y += stack.shift();
							P.LineTo(p, x, y);
						}

						c1x = x + stack.shift();
						c1y = y + stack.shift();
						c2x = c1x + stack.shift();
						c2y = c1y + stack.shift();
						x = c2x + stack.shift();
						y = c2y + stack.shift();
						P.CurveTo(p, c1x, c1y, c2x, c2y, x, y);
			}
			else if(v=="o26")
			{
				if (stack.length % 2) {
							x += stack.shift();
						}

						while (stack.length > 0) {
							c1x = x;
							c1y = y + stack.shift();
							c2x = c1x + stack.shift();
							c2y = c1y + stack.shift();
							x = c2x;
							y = c2y + stack.shift();
							P.CurveTo(p, c1x, c1y, c2x, c2y, x, y);
						}

			}
			else if(v=="o27")
			{
				if (stack.length % 2) {
							y += stack.shift();
						}

						while (stack.length > 0) {
							c1x = x + stack.shift();
							c1y = y;
							c2x = c1x + stack.shift();
							c2y = c1y + stack.shift();
							x = c2x + stack.shift();
							y = c2y;
							P.CurveTo(p, c1x, c1y, c2x, c2y, x, y);
						}
			}
			else if(v=="o10" || v=="o29")	// callsubr || callgsubr
			{
				var obj = (v=="o10" ? pdct : font);
				if(stack.length==0) { console.log("error: empty stack");  }
				else {
					var ind = stack.pop();
					var subr = obj["Subrs"][ ind + obj["Bias"] ];
					state.x=x; state.y=y; state.nStems=nStems; state.haveWidth=haveWidth; state.width=width;  state.open=open;
					Typr["U"]["_drawCFF"](subr, state,font,pdct,p);
					x=state.x; y=state.y; nStems=state.nStems; haveWidth=state.haveWidth; width=state.width;  open=state.open;
				}
			}
			else if(v=="o30" || v=="o31")   // vhcurveto || hvcurveto
			{
				var count, count1 = stack.length;
				var index = 0;
				var alternate = v == "o31";

				count  = count1 & ~2;
				index += count1 - count;

				while ( index < count )
				{
					if(alternate)
					{
						c1x = x + stack.shift();
						c1y = y;
						c2x = c1x + stack.shift();
						c2y = c1y + stack.shift();
						y = c2y + stack.shift();
						if(count-index == 5) {  x = c2x + stack.shift();  index++;  }
						else x = c2x;
						alternate = false;
					}
					else
					{
						c1x = x;
						c1y = y + stack.shift();
						c2x = c1x + stack.shift();
						c2y = c1y + stack.shift();
						x = c2x + stack.shift();
						if(count-index == 5) {  y = c2y + stack.shift();  index++;  }
						else y = c2y;
						alternate = true;
					}
					P.CurveTo(p, c1x, c1y, c2x, c2y, x, y);
					index += 4;
				}
			}

			else if((v+"").charAt(0)=="o") {   console.log("Unknown operation: "+v, cmds); throw v;  }
			else stack.push(v);
		}
		//console.log(cmds);
		state.x=x; state.y=y; state.nStems=nStems; state.haveWidth=haveWidth; state.width=width; state.open=open;
	},


	"SVG" : function() {
		var M = {
			getScale : function(m) {  return Math.sqrt(Math.abs(m[0]*m[3]-m[1]*m[2]));  },
			translate: function(m,x,y) {  M.concat(m, [1,0,0,1,x,y]);  },
			rotate   : function(m,a  ) {  M.concat(m, [Math.cos(a), -Math.sin(a), Math.sin(a), Math.cos(a),0,0]);  },
			scale    : function(m,x,y) {  M.concat(m, [x,0,0,y,0,0]);  },
			concat   : function(m,w  ) {
				var a=m[0],b=m[1],c=m[2],d=m[3],tx=m[4],ty=m[5];
				m[0] = (a *w[0])+(b *w[2]);       m[1] = (a *w[1])+(b *w[3]);
				m[2] = (c *w[0])+(d *w[2]);       m[3] = (c *w[1])+(d *w[3]);
				m[4] = (tx*w[0])+(ty*w[2])+w[4];  m[5] = (tx*w[1])+(ty*w[3])+w[5];
			},
			invert   : function(m    ) {
				var a=m[0],b=m[1],c=m[2],d=m[3],tx=m[4],ty=m[5], adbc=a*d-b*c;
				m[0] = d/adbc;  m[1] = -b/adbc;  m[2] =-c/adbc;  m[3] =  a/adbc;
				m[4] = (c*ty - d*tx)/adbc;  m[5] = (b*tx - a*ty)/adbc;
			},
			multPoint: function(m, p ) {  var x=p[0],y=p[1];  return [x*m[0]+y*m[2]+m[4],   x*m[1]+y*m[3]+m[5]];  },
			multArray: function(m, a ) {  for(var i=0; i<a.length; i+=2) {  var x=a[i],y=a[i+1];  a[i]=x*m[0]+y*m[2]+m[4];  a[i+1]=x*m[1]+y*m[3]+m[5];  }  }
		}

		function _bracketSplit(str, lbr, rbr) {
			var out = [], pos=0, ci = 0, lvl = 0;
			while(true) {  //throw "e";
				var li = str.indexOf(lbr, ci);
				var ri = str.indexOf(rbr, ci);
				if(li==-1 && ri==-1) break;
				if(ri==-1 || (li!=-1 && li<ri)) {
					if(lvl==0) {  out.push(str.slice(pos,li).trim());  pos=li+1;  }
					lvl++;  ci=li+1;
				}
				else if(li==-1 || (ri!=-1 && ri<li)) {
					lvl--;
					if(lvl==0) {  out.push(str.slice(pos,ri).trim());  pos=ri+1;  }
					ci=ri+1;
				}
			}
			return out;
		}
		//"cssMap":
		function cssMap(str) {
			var pts = _bracketSplit(str, "{", "}");
			var css = {};
			for(var i=0; i<pts.length; i+=2) {
				var cn = pts[i].split(",");
				for(var j=0; j<cn.length; j++) {
					var cnj = cn[j].trim();  if(css[cnj]==null) css[cnj]="";
					css[cnj] += pts[i+1];
				}
			}
			return css;
		}
		//"readTrnf"
		function readTrnf(trna) {
			var pts = _bracketSplit(trna, "(",")");
			var m = [1,0,0,1,0,0];
			for(var i=0; i<pts.length; i+=2) {  var om=m;  m=_readTrnsAttr(pts[i], pts[i+1]);  M.concat(m,om);  }
			return m;
		}

		function _readTrnsAttr(fnc, vls) {
			//console.log(vls);
			//vls = vls.replace(/\-/g, " -").trim();
			var m = [1,0,0,1,0,0], gotSep = true;
			for(var i=0; i<vls.length; i++) {	// matrix(.99915 0 0 .99915.418.552)   matrix(1 0 0-.9474-22.535 271.03)
				var ch = vls.charAt(i);
				if(ch=="," || ch==" ") gotSep = true;
				else if(ch==".") {
					if(!gotSep) {  vls = vls.slice(0,i) + ","+vls.slice(i);  i++;  }     gotSep = false;
				}
				else if(ch=="-" && i>0 && vls[i-1]!="e") {  vls = vls.slice(0,i) + " "+vls.slice(i);  i++;  gotSep=true;  }
			}

			vls = vls.split(/\s*[\s,]\s*/).map(parseFloat);
			if(false) {}
			else if(fnc=="translate") {  if(vls.length==1) M.translate(m,vls[0],     0);  else M.translate(m,vls[0],vls[1]);  }
			else if(fnc=="scale"    ) {  if(vls.length==1) M.scale    (m,vls[0],vls[0]);  else M.scale    (m,vls[0],vls[1]);  }
			else if(fnc=="rotate"   ) {  var tx=0,ty=0;  if(vls.length!=1) { tx=vls[1];  ty=vls[2];  }  M.translate(m,-tx,-ty);  M.rotate(m,-Math.PI*vls[0]/180);  M.translate(m,tx,ty);  }
			else if(fnc=="matrix"   ) m = vls;
			else console.log("unknown transform: ", fnc);
			return m;
		}

		function toPath(str)
		{
			var pth = {cmds:[], crds:[]};
			if(str==null) return pth;

			var prsr = new DOMParser();
			var doc = prsr["parseFromString"](str,"image/svg+xml");

			//var svg = doc.firstChild;  while(svg.tagName!="svg") svg = svg.nextSibling;
			var svg = doc.getElementsByTagName("svg")[0];
			var vb = svg.getAttribute("viewBox");
			if(vb) vb = vb.trim().split(" ").map(parseFloat);  else   vb = [0,0,1000,1000];
			_toPath(svg.children, pth);
			for(var i=0; i<pth.crds.length; i+=2) {
				var x = pth.crds[i], y = pth.crds[i+1];
				x -= vb[0];
				y -= vb[1];
				y = -y;
				pth.crds[i] = x;
				pth.crds[i+1] = y;
			}
			return pth;
		}

		function _toPath(nds, pth, fill) {
			for(var ni=0; ni<nds.length; ni++) {
				var nd = nds[ni], tn = nd.tagName;
				var cfl = nd.getAttribute("fill");  if(cfl==null) cfl = fill;
				if(tn=="g") {
					var tp = {crds:[], cmds:[]};
					_toPath(nd.children, tp, cfl);
					var trf = nd.getAttribute("transform");
					if(trf) {
						var m = readTrnf(trf);
						M.multArray(m, tp.crds);
					}
					pth.crds=pth.crds.concat(tp.crds);
					pth.cmds=pth.cmds.concat(tp.cmds);
				}
				else if(tn=="path" || tn=="circle" || tn=="ellipse") {
					pth.cmds.push(cfl?cfl:"#000000");
					var d;
					if(tn=="path") d = nd.getAttribute("d");  //console.log(d);
					if(tn=="circle" || tn=="ellipse") {
						var vls=[0,0,0,0], nms=["cx","cy","rx","ry","r"];
						for(var i=0; i<5; i++) {  var V=nd.getAttribute(nms[i]);  if(V) {  V=parseFloat(V);  if(i<4) vls[i]=V;  else vls[2]=vls[3]=V;  }  }
						var cx=vls[0],cy=vls[1],rx=vls[2],ry=vls[3];
						d = ["M",cx-rx,cy,"a",rx,ry,0,1,0,rx*2,0,"a",rx,ry,0,1,0,-rx*2,0].join(" ");
					}
					svgToPath(d, pth);  pth.cmds.push("X");
				}
				else if(tn=="defs") {}
				else console.log(tn, nd);
			}
		}

		function _tokens(d) {
			var ts = [], off = 0, rn=false, cn="", pc="";  // reading number, current number, prev char
			while(off<d.length){
				var cc=d.charCodeAt(off), ch = d.charAt(off);  off++;
				var isNum = (48<=cc && cc<=57) || ch=="." || ch=="-" || ch=="e" || ch=="E";

				if(rn) {
					if( (ch=="-" && pc!="e") || (ch=="." && cn.indexOf(".")!=-1)) {  ts.push(parseFloat(cn));  cn=ch;  }
					else if(isNum) cn+=ch;
					else {  ts.push(parseFloat(cn));  if(ch!="," && ch!=" ") ts.push(ch);  rn=false;  }
				}
				else {
					if(isNum) {  cn=ch;  rn=true;  }
					else if(ch!="," && ch!=" ") ts.push(ch);
				}
				pc = ch;
			}
			if(rn) ts.push(parseFloat(cn));
			return ts;
		}

		function _reps(ts, off, ps) {
			var i = off;
			while(i<ts.length) {  if((typeof ts[i]) == "string") break;  i+=ps;  }
			return (i-off)/ps;
		}

		function svgToPath(d, pth) {
			var ts = _tokens(d);
			var i = 0, x = 0, y = 0, ox = 0, oy = 0, oldo=pth.crds.length;
			var pc = {"M":2,"L":2,"H":1,"V":1,   "T":2,"S":4, "A":7,   "Q":4, "C":6};
			var cmds = pth.cmds, crds = pth.crds;

			while(i<ts.length) {
				var cmd = ts[i];  i++;
				var cmu = cmd.toUpperCase();

				if(cmu=="Z") {  cmds.push("Z");  x=ox;  y=oy;  }
				else {
					var ps = pc[cmu], reps = _reps(ts, i, ps);

					for(var j=0; j<reps; j++) {
						// If a moveto is followed by multiple pairs of coordinates, the subsequent pairs are treated as implicit lineto commands.
						if(j==1 && cmu=="M") {  cmd=(cmd==cmu)?"L":"l";  cmu="L";  }

						var xi = 0, yi = 0;   if(cmd!=cmu) {  xi=x;  yi=y;  }

						if(false) {}
						else if(cmu=="M") {  x = xi+ts[i++];  y = yi+ts[i++];  cmds.push("M");  crds.push(x,y);  ox=x;  oy=y; }
						else if(cmu=="L") {  x = xi+ts[i++];  y = yi+ts[i++];  cmds.push("L");  crds.push(x,y);  }
						else if(cmu=="H") {  x = xi+ts[i++];                   cmds.push("L");  crds.push(x,y);  }
						else if(cmu=="V") {  y = yi+ts[i++];                   cmds.push("L");  crds.push(x,y);  }
						else if(cmu=="Q") {
							var x1=xi+ts[i++], y1=yi+ts[i++], x2=xi+ts[i++], y2=yi+ts[i++];
							cmds.push("Q");  crds.push(x1,y1,x2,y2);  x=x2;  y=y2;
						}
						else if(cmu=="T") {
							var co = Math.max(crds.length-2, oldo);
							var x1 = x+x-crds[co], y1 = y+y-crds[co+1];
							var x2=xi+ts[i++], y2=yi+ts[i++];
							cmds.push("Q");  crds.push(x1,y1,x2,y2);  x=x2;  y=y2;
						}
						else if(cmu=="C") {
							var x1=xi+ts[i++], y1=yi+ts[i++], x2=xi+ts[i++], y2=yi+ts[i++], x3=xi+ts[i++], y3=yi+ts[i++];
							cmds.push("C");  crds.push(x1,y1,x2,y2,x3,y3);  x=x3;  y=y3;
						}
						else if(cmu=="S") {
							var co = Math.max(crds.length-(cmds[cmds.length-1]=="C"?4:2), oldo);
							var x1 = x+x-crds[co], y1 = y+y-crds[co+1];
							var x2=xi+ts[i++], y2=yi+ts[i++], x3=xi+ts[i++], y3=yi+ts[i++];
							cmds.push("C");  crds.push(x1,y1,x2,y2,x3,y3);  x=x3;  y=y3;
						}
						else if(cmu=="A") {  // convert SVG Arc to four cubic bézier segments "C"
							var x1 = x, y1 = y;
							var rx = ts[i++], ry = ts[i++];
							var phi = ts[i++]*(Math.PI/180), fA = ts[i++], fS = ts[i++];
							var x2 = xi+ts[i++], y2 = yi+ts[i++];
							if(x2==x && y2==y && rx==0 && ry==0) continue;

							var hdx = (x1-x2)/2, hdy = (y1-y2)/2;
							var cosP = Math.cos(phi), sinP = Math.sin(phi);
							var x1A =  cosP * hdx + sinP * hdy;
							var y1A = -sinP * hdx + cosP * hdy;

							var rxS = rx*rx, ryS = ry*ry;
							var x1AS  = x1A*x1A, y1AS = y1A*y1A;
							var frc = (rxS*ryS  - rxS*y1AS - ryS*x1AS)  /  (rxS*y1AS + ryS*x1AS);
							var coef = (fA!=fS ? 1 : -1) * Math.sqrt(  Math.max(frc,0)  );
							var cxA =  coef * (rx * y1A) / ry;
							var cyA = -coef * (ry * x1A) / rx;

							var cx = cosP*cxA - sinP*cyA + (x1+x2)/2;
							var cy = sinP*cxA + cosP*cyA + (y1+y2)/2;

							var angl = function(ux,uy,vx,vy) {  var lU = Math.sqrt(ux*ux+uy*uy), lV = Math.sqrt(vx*vx+vy*vy);
									var num = (ux*vx+uy*vy) / (lU*lV);  //console.log(num, Math.acos(num));
									return (ux*vy-uy*vx>=0?1:-1) * Math.acos( Math.max(-1, Math.min(1, num)) );  }

							var vX = (x1A-cxA)/rx, vY = (y1A-cyA)/ry;
							var theta1 = angl( 1, 0, vX,vY);
							var dtheta = angl(vX,vY, (-x1A-cxA)/rx, (-y1A-cyA)/ry);
							dtheta = dtheta % (2*Math.PI);

							var arc = function(gst,x,y,r,a0,a1, neg) {
								var rotate = function(m, a) {  var si=Math.sin(a), co=Math.cos(a);
									var a=m[0],b=m[1],c=m[2],d=m[3];
									m[0] = (a *co)+(b *si);   m[1] = (-a *si)+(b *co);
									m[2] = (c *co)+(d *si);   m[3] = (-c *si)+(d *co);
								}
								var multArr= function(m,a) {
									for(var j=0; j<a.length; j+=2) {
										var x=a[j], y=a[j+1];
										a[j  ] = m[0]*x + m[2]*y + m[4];
										a[j+1] = m[1]*x + m[3]*y + m[5];
									}
								}
								var concatA= function(a,b) {  for(var j=0; j<b.length; j++) a.push(b[j]);  }
								var concatP= function(p,r) {  concatA(p.cmds,r.cmds);  concatA(p.crds,r.crds);  }
								// circle from a0 counter-clock-wise to a1
								if(neg) while(a1>a0) a1-=2*Math.PI;
								else    while(a1<a0) a1+=2*Math.PI;
								var th = (a1-a0)/4;

								var x0 = Math.cos(th/2), y0 = -Math.sin(th/2);
								var x1 = (4-x0)/3, y1 = y0==0 ? y0 : (1-x0)*(3-x0)/(3*y0);
								var x2 = x1, y2 = -y1;
								var x3 = x0, y3 = -y0;

								var ps = [x1,y1,x2,y2,x3,y3];

								var pth = {cmds:["C","C","C","C"], crds:ps.slice(0)};
								var rot = [1,0,0,1,0,0];  rotate(rot,-th);
								for(var j=0; j<3; j++) {  multArr(rot,ps);  concatA(pth.crds,ps);  }

								rotate(rot, -a0+th/2);  rot[0]*=r;  rot[1]*=r;  rot[2]*=r;  rot[3]*=r;  rot[4]=x;  rot[5]=y;
								multArr(rot, pth.crds);
								multArr(gst.ctm, pth.crds);
								concatP(gst.pth, pth);
							}

							var gst = {pth:pth, ctm:[rx*cosP,rx*sinP,-ry*sinP,ry*cosP,cx,cy]};
							arc(gst, 0,0, 1, theta1, theta1+dtheta, fS==0);
							x=x2;  y=y2;
						}
						else console.log("Unknown SVG command "+cmd);
					}
				}
			}
		};
		return {  "cssMap":cssMap, "readTrnf":readTrnf, svgToPath:svgToPath, toPath:toPath };
	}(),




	"initHB": function(hurl,resp) {
	var codeLength = function(code) {
		var len=0;
		if     ((code&(0xffffffff-(1<< 7)+1))==0) {  len=1;  }
		else if((code&(0xffffffff-(1<<11)+1))==0) {  len=2;  }
		else if((code&(0xffffffff-(1<<16)+1))==0) {  len=3;  }
		else if((code&(0xffffffff-(1<<21)+1))==0) {  len=4;  }
		return len;
	}
	var te = new window["TextEncoder"]("utf8");

	fetch(hurl)
		.then(function (x  ) { return x["arrayBuffer"](); })
		.then(function (ab ) { return WebAssembly["instantiate"](ab); })
		.then(function (res) {
			console.log("HB ready");
			var exp = res["instance"]["exports"], mem=exp["memory"];
			mem["grow"](700); // each page is 64kb in size
			var heapu8  = new Uint8Array (mem.buffer);
			var u32 = new Uint32Array(mem.buffer);
			var i32 = new Int32Array (mem.buffer);
			var __lastFnt, blob,blobPtr,face,font;

			Typr["U"]["shapeHB"] = (function () {

				var toJson = function (ptr) {
					var length = exp["hb_buffer_get_length"](ptr);
					var result = [];
					var iPtr32 = exp["hb_buffer_get_glyph_infos"](ptr, 0) >>>2;
					var pPtr32 = exp["hb_buffer_get_glyph_positions"](ptr, 0) >>>2;
					for(var i=0; i<length; ++i) {
						var a=iPtr32+i*5, b=pPtr32+i*5;
					  result.push({
						"g" : u32[a + 0],
						"cl": u32[a + 2],
						"ax": i32[b + 0],
						"ay": i32[b + 1],
						"dx": i32[b + 2],
						"dy": i32[b + 3]
					  });
					}
					return result;
				}
				return function (fnt, str, ltr) {
					var fdata = fnt["_data"], fn = fnt["name"]["postScriptName"];

					if(__lastFnt!=fn) {
						if(blob!=null) {
							exp["hb_blob_destroy"](blob);
							exp["free"](blobPtr);
							exp["hb_face_destroy"](face);
							exp["hb_font_destroy"](font);
						}
						blobPtr = exp["malloc"](fdata.byteLength);  heapu8.set(fdata, blobPtr);
						blob = exp["hb_blob_create"](blobPtr, fdata.byteLength, 2, 0, 0);
						face = exp["hb_face_create"](blob, 0);
						font = exp["hb_font_create"](face)
						__lastFnt = fn;
					}

					var buffer = exp["hb_buffer_create"]();
					var bytes = te["encode"](str);
					var len=bytes.length, strp = exp["malloc"](len);  heapu8.set(bytes, strp);
					exp["hb_buffer_add_utf8"](buffer, strp, len, 0, len);
					exp["free"](strp);

					exp["hb_buffer_set_direction"](buffer,ltr?4:5);
					exp["hb_buffer_guess_segment_properties"](buffer);
					exp["hb_shape"](font, buffer, 0, 0);
					var json = toJson(buffer)//buffer["json"]();
					exp["hb_buffer_destroy"](buffer);

					var arr = json.slice(0);  if(!ltr) arr.reverse();
					var ci=0, bi=0;  // character index, binary index
					for(var i=1; i<arr.length; i++) {
						var gl = arr[i], cl=gl["cl"];
						while(true) {
							var cpt = str.codePointAt(ci), cln = codeLength(cpt);
							if(bi+cln <=cl) {  bi+=cln;  ci += cpt<=0xffff ? 1 : 2;  }
							else break;
						}
						//while(bi+codeLength(str.charCodeAt(ci)) <=cl) {  bi+=codeLength(str.charCodeAt(ci));  ci++;  }
						gl["cl"]=ci;
					}
					return json;
				}
			}());
			resp();
		});
	}
}


  /* ===== End embedded Typr.U.js ===== */

  /* ===== Begin embedded blueimp-md5.js (upstream readable source) ===== */
/*
 * JavaScript MD5
 * https://github.com/blueimp/JavaScript-MD5
 *
 * Copyright 2011, Sebastian Tschan
 * https://blueimp.net
 *
 * Licensed under the MIT license:
 * https://opensource.org/licenses/MIT
 *
 * Based on
 * A JavaScript implementation of the RSA Data Security, Inc. MD5 Message
 * Digest Algorithm, as defined in RFC 1321.
 * Version 2.2 Copyright (C) Paul Johnston 1999 - 2009
 * Other contributors: Greg Holt, Andrew Kepert, Ydnar, Lostinet
 * Distributed under the BSD License
 * See http://pajhome.org.uk/crypt/md5 for more info.
 */

/* global define */

/* eslint-disable strict */

;(function ($) {
  'use strict'

  /**
   * Add integers, wrapping at 2^32.
   * This uses 16-bit operations internally to work around bugs in interpreters.
   *
   * @param {number} x First integer
   * @param {number} y Second integer
   * @returns {number} Sum
   */
  function safeAdd(x, y) {
    var lsw = (x & 0xffff) + (y & 0xffff)
    var msw = (x >> 16) + (y >> 16) + (lsw >> 16)
    return (msw << 16) | (lsw & 0xffff)
  }

  /**
   * Bitwise rotate a 32-bit number to the left.
   *
   * @param {number} num 32-bit number
   * @param {number} cnt Rotation count
   * @returns {number} Rotated number
   */
  function bitRotateLeft(num, cnt) {
    return (num << cnt) | (num >>> (32 - cnt))
  }

  /**
   * Basic operation the algorithm uses.
   *
   * @param {number} q q
   * @param {number} a a
   * @param {number} b b
   * @param {number} x x
   * @param {number} s s
   * @param {number} t t
   * @returns {number} Result
   */
  function md5cmn(q, a, b, x, s, t) {
    return safeAdd(bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b)
  }
  /**
   * Basic operation the algorithm uses.
   *
   * @param {number} a a
   * @param {number} b b
   * @param {number} c c
   * @param {number} d d
   * @param {number} x x
   * @param {number} s s
   * @param {number} t t
   * @returns {number} Result
   */
  function md5ff(a, b, c, d, x, s, t) {
    return md5cmn((b & c) | (~b & d), a, b, x, s, t)
  }
  /**
   * Basic operation the algorithm uses.
   *
   * @param {number} a a
   * @param {number} b b
   * @param {number} c c
   * @param {number} d d
   * @param {number} x x
   * @param {number} s s
   * @param {number} t t
   * @returns {number} Result
   */
  function md5gg(a, b, c, d, x, s, t) {
    return md5cmn((b & d) | (c & ~d), a, b, x, s, t)
  }
  /**
   * Basic operation the algorithm uses.
   *
   * @param {number} a a
   * @param {number} b b
   * @param {number} c c
   * @param {number} d d
   * @param {number} x x
   * @param {number} s s
   * @param {number} t t
   * @returns {number} Result
   */
  function md5hh(a, b, c, d, x, s, t) {
    return md5cmn(b ^ c ^ d, a, b, x, s, t)
  }
  /**
   * Basic operation the algorithm uses.
   *
   * @param {number} a a
   * @param {number} b b
   * @param {number} c c
   * @param {number} d d
   * @param {number} x x
   * @param {number} s s
   * @param {number} t t
   * @returns {number} Result
   */
  function md5ii(a, b, c, d, x, s, t) {
    return md5cmn(c ^ (b | ~d), a, b, x, s, t)
  }

  /**
   * Calculate the MD5 of an array of little-endian words, and a bit length.
   *
   * @param {Array} x Array of little-endian words
   * @param {number} len Bit length
   * @returns {Array<number>} MD5 Array
   */
  function binlMD5(x, len) {
    /* append padding */
    x[len >> 5] |= 0x80 << len % 32
    x[(((len + 64) >>> 9) << 4) + 14] = len

    var i
    var olda
    var oldb
    var oldc
    var oldd
    var a = 1732584193
    var b = -271733879
    var c = -1732584194
    var d = 271733878

    for (i = 0; i < x.length; i += 16) {
      olda = a
      oldb = b
      oldc = c
      oldd = d

      a = md5ff(a, b, c, d, x[i], 7, -680876936)
      d = md5ff(d, a, b, c, x[i + 1], 12, -389564586)
      c = md5ff(c, d, a, b, x[i + 2], 17, 606105819)
      b = md5ff(b, c, d, a, x[i + 3], 22, -1044525330)
      a = md5ff(a, b, c, d, x[i + 4], 7, -176418897)
      d = md5ff(d, a, b, c, x[i + 5], 12, 1200080426)
      c = md5ff(c, d, a, b, x[i + 6], 17, -1473231341)
      b = md5ff(b, c, d, a, x[i + 7], 22, -45705983)
      a = md5ff(a, b, c, d, x[i + 8], 7, 1770035416)
      d = md5ff(d, a, b, c, x[i + 9], 12, -1958414417)
      c = md5ff(c, d, a, b, x[i + 10], 17, -42063)
      b = md5ff(b, c, d, a, x[i + 11], 22, -1990404162)
      a = md5ff(a, b, c, d, x[i + 12], 7, 1804603682)
      d = md5ff(d, a, b, c, x[i + 13], 12, -40341101)
      c = md5ff(c, d, a, b, x[i + 14], 17, -1502002290)
      b = md5ff(b, c, d, a, x[i + 15], 22, 1236535329)

      a = md5gg(a, b, c, d, x[i + 1], 5, -165796510)
      d = md5gg(d, a, b, c, x[i + 6], 9, -1069501632)
      c = md5gg(c, d, a, b, x[i + 11], 14, 643717713)
      b = md5gg(b, c, d, a, x[i], 20, -373897302)
      a = md5gg(a, b, c, d, x[i + 5], 5, -701558691)
      d = md5gg(d, a, b, c, x[i + 10], 9, 38016083)
      c = md5gg(c, d, a, b, x[i + 15], 14, -660478335)
      b = md5gg(b, c, d, a, x[i + 4], 20, -405537848)
      a = md5gg(a, b, c, d, x[i + 9], 5, 568446438)
      d = md5gg(d, a, b, c, x[i + 14], 9, -1019803690)
      c = md5gg(c, d, a, b, x[i + 3], 14, -187363961)
      b = md5gg(b, c, d, a, x[i + 8], 20, 1163531501)
      a = md5gg(a, b, c, d, x[i + 13], 5, -1444681467)
      d = md5gg(d, a, b, c, x[i + 2], 9, -51403784)
      c = md5gg(c, d, a, b, x[i + 7], 14, 1735328473)
      b = md5gg(b, c, d, a, x[i + 12], 20, -1926607734)

      a = md5hh(a, b, c, d, x[i + 5], 4, -378558)
      d = md5hh(d, a, b, c, x[i + 8], 11, -2022574463)
      c = md5hh(c, d, a, b, x[i + 11], 16, 1839030562)
      b = md5hh(b, c, d, a, x[i + 14], 23, -35309556)
      a = md5hh(a, b, c, d, x[i + 1], 4, -1530992060)
      d = md5hh(d, a, b, c, x[i + 4], 11, 1272893353)
      c = md5hh(c, d, a, b, x[i + 7], 16, -155497632)
      b = md5hh(b, c, d, a, x[i + 10], 23, -1094730640)
      a = md5hh(a, b, c, d, x[i + 13], 4, 681279174)
      d = md5hh(d, a, b, c, x[i], 11, -358537222)
      c = md5hh(c, d, a, b, x[i + 3], 16, -722521979)
      b = md5hh(b, c, d, a, x[i + 6], 23, 76029189)
      a = md5hh(a, b, c, d, x[i + 9], 4, -640364487)
      d = md5hh(d, a, b, c, x[i + 12], 11, -421815835)
      c = md5hh(c, d, a, b, x[i + 15], 16, 530742520)
      b = md5hh(b, c, d, a, x[i + 2], 23, -995338651)

      a = md5ii(a, b, c, d, x[i], 6, -198630844)
      d = md5ii(d, a, b, c, x[i + 7], 10, 1126891415)
      c = md5ii(c, d, a, b, x[i + 14], 15, -1416354905)
      b = md5ii(b, c, d, a, x[i + 5], 21, -57434055)
      a = md5ii(a, b, c, d, x[i + 12], 6, 1700485571)
      d = md5ii(d, a, b, c, x[i + 3], 10, -1894986606)
      c = md5ii(c, d, a, b, x[i + 10], 15, -1051523)
      b = md5ii(b, c, d, a, x[i + 1], 21, -2054922799)
      a = md5ii(a, b, c, d, x[i + 8], 6, 1873313359)
      d = md5ii(d, a, b, c, x[i + 15], 10, -30611744)
      c = md5ii(c, d, a, b, x[i + 6], 15, -1560198380)
      b = md5ii(b, c, d, a, x[i + 13], 21, 1309151649)
      a = md5ii(a, b, c, d, x[i + 4], 6, -145523070)
      d = md5ii(d, a, b, c, x[i + 11], 10, -1120210379)
      c = md5ii(c, d, a, b, x[i + 2], 15, 718787259)
      b = md5ii(b, c, d, a, x[i + 9], 21, -343485551)

      a = safeAdd(a, olda)
      b = safeAdd(b, oldb)
      c = safeAdd(c, oldc)
      d = safeAdd(d, oldd)
    }
    return [a, b, c, d]
  }

  /**
   * Convert an array of little-endian words to a string
   *
   * @param {Array<number>} input MD5 Array
   * @returns {string} MD5 string
   */
  function binl2rstr(input) {
    var i
    var output = ''
    var length32 = input.length * 32
    for (i = 0; i < length32; i += 8) {
      output += String.fromCharCode((input[i >> 5] >>> i % 32) & 0xff)
    }
    return output
  }

  /**
   * Convert a raw string to an array of little-endian words
   * Characters >255 have their high-byte silently ignored.
   *
   * @param {string} input Raw input string
   * @returns {Array<number>} Array of little-endian words
   */
  function rstr2binl(input) {
    var i
    var output = []
    output[(input.length >> 2) - 1] = undefined
    for (i = 0; i < output.length; i += 1) {
      output[i] = 0
    }
    var length8 = input.length * 8
    for (i = 0; i < length8; i += 8) {
      output[i >> 5] |= (input.charCodeAt(i / 8) & 0xff) << i % 32
    }
    return output
  }

  /**
   * Calculate the MD5 of a raw string
   *
   * @param {string} s Input string
   * @returns {string} Raw MD5 string
   */
  function rstrMD5(s) {
    return binl2rstr(binlMD5(rstr2binl(s), s.length * 8))
  }

  /**
   * Calculates the HMAC-MD5 of a key and some data (raw strings)
   *
   * @param {string} key HMAC key
   * @param {string} data Raw input string
   * @returns {string} Raw MD5 string
   */
  function rstrHMACMD5(key, data) {
    var i
    var bkey = rstr2binl(key)
    var ipad = []
    var opad = []
    var hash
    ipad[15] = opad[15] = undefined
    if (bkey.length > 16) {
      bkey = binlMD5(bkey, key.length * 8)
    }
    for (i = 0; i < 16; i += 1) {
      ipad[i] = bkey[i] ^ 0x36363636
      opad[i] = bkey[i] ^ 0x5c5c5c5c
    }
    hash = binlMD5(ipad.concat(rstr2binl(data)), 512 + data.length * 8)
    return binl2rstr(binlMD5(opad.concat(hash), 512 + 128))
  }

  /**
   * Convert a raw string to a hex string
   *
   * @param {string} input Raw input string
   * @returns {string} Hex encoded string
   */
  function rstr2hex(input) {
    var hexTab = '0123456789abcdef'
    var output = ''
    var x
    var i
    for (i = 0; i < input.length; i += 1) {
      x = input.charCodeAt(i)
      output += hexTab.charAt((x >>> 4) & 0x0f) + hexTab.charAt(x & 0x0f)
    }
    return output
  }

  /**
   * Encode a string as UTF-8
   *
   * @param {string} input Input string
   * @returns {string} UTF8 string
   */
  function str2rstrUTF8(input) {
    return unescape(encodeURIComponent(input))
  }

  /**
   * Encodes input string as raw MD5 string
   *
   * @param {string} s Input string
   * @returns {string} Raw MD5 string
   */
  function rawMD5(s) {
    return rstrMD5(str2rstrUTF8(s))
  }
  /**
   * Encodes input string as Hex encoded string
   *
   * @param {string} s Input string
   * @returns {string} Hex encoded string
   */
  function hexMD5(s) {
    return rstr2hex(rawMD5(s))
  }
  /**
   * Calculates the raw HMAC-MD5 for the given key and data
   *
   * @param {string} k HMAC key
   * @param {string} d Input string
   * @returns {string} Raw MD5 string
   */
  function rawHMACMD5(k, d) {
    return rstrHMACMD5(str2rstrUTF8(k), str2rstrUTF8(d))
  }
  /**
   * Calculates the Hex encoded HMAC-MD5 for the given key and data
   *
   * @param {string} k HMAC key
   * @param {string} d Input string
   * @returns {string} Raw MD5 string
   */
  function hexHMACMD5(k, d) {
    return rstr2hex(rawHMACMD5(k, d))
  }

  /**
   * Calculates MD5 value for a given string.
   * If a key is provided, calculates the HMAC-MD5 value.
   * Returns a Hex encoded string unless the raw argument is given.
   *
   * @param {string} string Input string
   * @param {string} [key] HMAC key
   * @param {boolean} [raw] Raw output switch
   * @returns {string} MD5 output
   */
  function md5(string, key, raw) {
    if (!key) {
      if (!raw) {
        return hexMD5(string)
      }
      return rawMD5(string)
    }
    if (!raw) {
      return hexHMACMD5(key, string)
    }
    return rawHMACMD5(key, string)
  }

  if (typeof define === 'function' && define.amd) {
    define(function () {
      return md5
    })
  } else if (typeof module === 'object' && module.exports) {
    module.exports = md5
  } else {
    $.md5 = md5
  }
})(typeof globalThis !== "undefined" ? globalThis : window)
  /* ===== End embedded blueimp-md5.js ===== */
  // ==================== iframe 跨窗口通信 ====================
  // 存储从 iframe 通过 postMessage 发来的题目数据。
  // 题目页面切换时旧 iframe 可能还会继续发送轮询结果，因此同时记录
  // 消息来源和时间，避免顶层面板一直沿用上一个随堂练习的数据。
  window.__xxt_iframe_data = null;
  window.__xxt_iframe_context = null;
  // 最近一次 iframe 结果的上下文和导航序号不会随 extract() 清空，
  // 用于区分任务切换时迟到的 iframe 回传。
  window.__xxt_last_iframe_context = null;
  window.__xxt_last_iframe_source = null;
  window.__xxt_last_navigation_source = null;
  window.__xxt_navigation_serial = 0;
  // 页面/任务切换时由顶层窗口设置，负责清空面板中的旧结果
  window.__xxt_reset_extraction = null;

  function currentWindowContext() {
    let href = '', title = '', frameKey = '';
    try { href = window.location.href; } catch (e) {}
    try { title = document.title || ''; } catch (e) {}
    try {
      const frame = window.frameElement;
      if (frame) {
        const siblings = frame.parentElement ? Array.from(frame.parentElement.children) : [];
        frameKey = `${frame.id || ''}|${frame.name || ''}|${frame.getAttribute('src') || ''}|${siblings.indexOf(frame)}`;
      }
    } catch (e) {}
    return { href, title, frameKey };
  }

  function getDirectChildIframes(root = document) {
    if (!root || !root.querySelectorAll) return [];
    return Array.from(root.querySelectorAll('iframe')).filter(frame => frame.ownerDocument === root);
  }

  function isDirectChildFrameSource(source) {
    if (!source) return false;
    return getDirectChildIframes(document).some(frame => {
      try { return frame.contentWindow === source; } catch (e) { return false; }
    });
  }

  function relayFrameMessageToParent(message) {
    const relayContexts = Array.isArray(message.relayContexts) ? [...message.relayContexts] : [];
    relayContexts.push(currentWindowContext());
    try { window.parent.postMessage({ ...message, relayContexts }, '*'); } catch (e) {}
  }

  // iframe 消息逐层由直属父窗口转发。每层都会验证来源并保留页面上下文，
  // 避免切换题目后迟到的 iframe 结果覆盖当前缓存。
  window.addEventListener('message', function(e) {
    if (!e.data || !['xxt-iframe-navigation', 'xxt-iframe-result'].includes(e.data.type)) return;
    if (!isDirectChildFrameSource(e.source)) return;
    if (window.top !== window.self) {
      relayFrameMessageToParent(e.data);
      return;
    }

    if (e.data.type === 'xxt-iframe-navigation') {
      window.__xxt_navigation_serial = (window.__xxt_navigation_serial || 0) + 1;
      window.__xxt_last_navigation_source = e.source || null;
      window.__xxt_last_navigation_context = e.data.context || null;
      window.__xxt_last_navigation_at = Date.now();
      window.__xxt_navigation_started_at = Date.now();
      if (window.__xxt_reset_extraction) window.__xxt_reset_extraction();
      return;
    }

    if (!e.data.data) return;
    const messageHref = e.data.context && e.data.context.href ? e.data.context.href : '';
    const messageSignature = iframeDataSignature(e.data.data);
    if (window.__xxt_ignore_iframe_signature && messageSignature &&
        messageSignature === window.__xxt_ignore_iframe_signature &&
        Date.now() - (window.__xxt_navigation_started_at || 0) < 6000) {
      return;
    }
    window.__xxt_iframe_data = e.data.data;
    window.__xxt_last_iframe_source = e.source || null;
    window.__xxt_iframe_context = {
      href: messageHref,
      title: e.data.context && e.data.context.title ? e.data.context.title : '',
      relayContexts: Array.isArray(e.data.relayContexts) ? e.data.relayContexts : [],
      receivedAt: Date.now()
    };
    window.__xxt_last_iframe_context = { ...window.__xxt_iframe_context };
    window.__xxt_last_iframe_message_at = Date.now();
    window.__xxt_last_iframe_signature = messageSignature;
  });

  // 向当前文档下所有 iframe 请求重新提取。跨域 iframe 不能直接读取 DOM，
  // 但仍可以安全地 postMessage；中间 iframe 会继续向其子 iframe 转发请求。
  function relayIframeExtractRequest(message, root) {
    const frames = (root || document).querySelectorAll('iframe');
    frames.forEach(frame => {
      try { frame.contentWindow.postMessage(message, '*'); } catch (e) {}
    });
  }

  function requestIframeExtraction(requestId, targetWindows, extra = {}) {
    const id = requestId || `xxt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const message = { type: 'xxt-request-extract', requestId: id, sentAt: Date.now(), ...extra };
    const targets = Array.isArray(targetWindows) ? [...new Set(targetWindows.filter(Boolean))] : [];
    if (targets.length) {
      targets.forEach(target => { try { target.postMessage(message, '*'); } catch (e) {} });
    } else {
      relayIframeExtractRequest(message);
    }
    return id;
  }

  function emptyExtractResult() {
    return {
      results: { '单选': [], '多选': [], '填空': [], '判断': [], '简答': [] },
      typeOrder: [], wrongCount: 0, hasMyAnswer: false, hasCorrectAnswer: false
    };
  }

  // ==================== 样式注入 ====================
  const css = `
/* ============ 设计变量（浅色） ============ */
#xxt-panel, #xxt-settings-modal, #xxt-history-modal, #xxt-editor-modal, #xxt-bank-modal, #xxt-save-bank-modal, #xxt-batch-modal, #xxt-preview-modal, #xxt-batch-progress-card {
  --xxt-grad: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%);
  --xxt-grad-soft: linear-gradient(135deg, rgba(99,102,241,0.10) 0%, rgba(236,72,153,0.10) 100%);
  --xxt-accent: #5b3ad8;
  --xxt-accent-strong: #4a2dc7;
  --xxt-surface: #ffffff;
  --xxt-surface-solid: #ffffff;
  --xxt-border: #e5e7eb;
  --xxt-shadow: 0 20px 48px -12px rgba(49,46,129,0.22), 0 8px 18px -8px rgba(15,23,42,0.10);
  --xxt-text: #111827;
  --xxt-text-soft: #4b5563;
  --xxt-radius: 18px;
}
/* 全局字体与渲染优化 */
#xxt-panel, #xxt-settings-modal, #xxt-history-modal, #xxt-editor-modal, #xxt-bank-modal, #xxt-save-bank-modal, #xxt-batch-modal, #xxt-preview-modal, #xxt-batch-progress-card {
  font-family: "PingFang SC","Microsoft YaHei","微软雅黑",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
}

/* ===== 固定显示的主面板（毛玻璃） ===== */
#xxt-panel {
  position: fixed; top: 72px; right: 20px; z-index: 99999;
  width: min(384px, calc(100vw - 16px)); box-sizing: border-box;
  background: #ffffff;
  backdrop-filter: blur(24px) saturate(160%);
  -webkit-backdrop-filter: blur(24px) saturate(160%);
  border: 1px solid var(--xxt-border);
  border-radius: 22px;
  box-shadow: var(--xxt-shadow);
  padding: 22px 20px 20px;
  font-size: 13px; color: var(--xxt-text);
  max-height: calc(100vh - 16px); overflow-y: auto;
}
#xxt-panel::-webkit-scrollbar { width: 6px; }
#xxt-panel::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, #c4b5fd, #f0abfc);
  border-radius: 6px; border: 1px solid transparent;
  background-clip: padding-box;
}
#xxt-panel::-webkit-scrollbar-track { background: transparent; }
/* ===== 标题栏 ===== */
#xxt-panel .xxt-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 16px; padding-bottom: 14px;
  border-bottom: 1px solid var(--xxt-border);
  cursor: move; user-select: none;
}
#xxt-panel .xxt-header h3 {
  font-size: 16px; font-weight: 800; color: var(--xxt-text);
  margin: 0; letter-spacing: 0.3px;
  background: var(--xxt-grad);
  -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent;
}
#xxt-panel .xxt-bank-entry {
  width: 100%; min-height: 68px; margin: -3px 0 14px; padding: 10px 13px;
  border: 1px solid rgba(124,92,240,0.24); border-radius: 16px;
  background: var(--xxt-grad-soft); color: var(--xxt-text); cursor: pointer;
  display: flex; align-items: center; gap: 11px; text-align: left;
  font-family: inherit; transition: all 0.24s cubic-bezier(.4,0,.2,1);
  box-shadow: 0 6px 16px -11px rgba(91,58,216,0.45);
}
#xxt-panel .xxt-bank-entry:hover {
  border-color: rgba(124,92,240,0.52); transform: translateY(-2px);
  box-shadow: 0 13px 24px -12px rgba(91,58,216,0.55); filter: saturate(1.08);
}
#xxt-panel .xxt-bank-entry:active { transform: translateY(0) scale(0.99); }
#xxt-panel .xxt-bank-entry:focus-visible { outline: none; box-shadow: 0 0 0 4px rgba(124,92,240,0.20); }
#xxt-panel .xxt-bank-entry-icon {
  width: 42px; height: 42px; flex: 0 0 42px; border-radius: 13px;
  display: flex; align-items: center; justify-content: center; font-size: 22px;
  background: #fff; box-shadow: 0 6px 12px -8px rgba(91,58,216,0.55);
}
#xxt-panel .xxt-bank-entry-copy { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 2px; }
#xxt-panel .xxt-bank-entry-copy strong { font-size: 14px; line-height: 1.3; font-weight: 800; color: var(--xxt-accent-strong); }
#xxt-panel .xxt-bank-entry-copy small { font-size: 11px; line-height: 1.4; color: var(--xxt-text-soft); font-weight: 600; }
#xxt-panel .xxt-bank-entry-arrow { font-size: 24px; line-height: 1; color: var(--xxt-accent); transition: transform 0.22s ease; }
#xxt-panel .xxt-bank-entry:hover .xxt-bank-entry-arrow { transform: translateX(3px); }
/* ===== 星夜题库资源入口 ===== */
#xxt-panel .xxt-tiku-promo {
  margin: 0 0 10px; padding: 9px 10px;
  border: 1px solid rgba(14,165,233,.28); border-radius: 14px;
  background: linear-gradient(135deg, rgba(14,165,233,.09), rgba(16,185,129,.08));
  box-shadow: 0 7px 18px -14px rgba(14,116,144,.52);
}
#xxt-panel .xxt-tiku-promo-top { display:flex; align-items:center; gap:8px; min-width:0; }
#xxt-panel .xxt-tiku-promo-icon {
  width:30px; height:30px; flex:0 0 30px; border-radius:10px;
  display:grid; place-items:center; background:#fff; color:#0284c7; font-size:16px;
  box-shadow:0 5px 11px -8px rgba(2,132,199,.65);
}
#xxt-panel .xxt-tiku-promo-copy { display:flex; flex:1; min-width:0; flex-direction:column; gap:1px; }
#xxt-panel .xxt-tiku-promo-copy strong { color:#0369a1; font-size:12.5px; line-height:1.3; font-weight:800; }
#xxt-panel .xxt-tiku-promo-copy small { color:#52708a; font-size:10px; line-height:1.35; font-weight:600; }
#xxt-panel .xxt-tiku-promo-actions { display:flex; gap:6px; margin-top:8px; }
#xxt-panel .xxt-tiku-promo-link {
  display:inline-flex; align-items:center; justify-content:center; min-height:27px; flex:1;
  padding:0 8px; border:1px solid rgba(2,132,199,.52); border-radius:9px;
  color:#0369a1; background:rgba(255,255,255,.68); text-decoration:none;
  font-size:10.5px; font-weight:800; line-height:1; transition:all .2s ease;
}
#xxt-panel .xxt-tiku-promo-link:hover { transform:translateY(-1px); background:#0284c7; border-color:#0284c7; color:#fff; box-shadow:0 7px 14px -8px rgba(2,132,199,.68); }
#xxt-panel .xxt-tiku-promo-link:focus-visible { outline:none; box-shadow:0 0 0 3px rgba(14,165,233,.24); }
/* ===== 提取按钮（渐变主按钮） ===== */
#xxt-panel .xxt-btn-extract {
  display: block; width: 100%; padding: 13px; border: none;
  border-radius: 14px; font-size: 14.5px; font-weight: 700; cursor: pointer;
  margin-bottom: 12px; transition: all 0.28s cubic-bezier(.4,0,.2,1);
  background: var(--xxt-grad); color: #fff;
  box-shadow: 0 10px 22px -8px rgba(124,92,240,0.55);
  letter-spacing: 1.5px;
}
#xxt-panel .xxt-btn-extract:hover {
  transform: translateY(-2px);
  box-shadow: 0 16px 30px -8px rgba(124,92,240,0.7);
  filter: brightness(1.05);
}
#xxt-panel .xxt-btn-extract:active { transform: translateY(0) scale(0.98); }
#xxt-panel .xxt-btn-extract:disabled {
  background: linear-gradient(135deg,#cbd5e1,#cbd5e1);
  box-shadow: none; cursor: not-allowed; transform: none; filter: none;
}
#xxt-panel .xxt-btn-batch {
  width: 100%; padding: 10px 12px; margin: -3px 0 12px; border-radius: 13px;
  border: 1.5px dashed rgba(91,58,216,.54); background: rgba(124,92,240,.055);
  color: var(--xxt-accent-strong); cursor: pointer; font: 700 12.5px/1.35 inherit;
  transition: all .22s ease;
}
#xxt-panel .xxt-btn-batch:hover { background: var(--xxt-grad-soft); border-style: solid; transform: translateY(-1px); box-shadow: 0 9px 18px -12px rgba(91,58,216,.6); }
#xxt-panel .xxt-btn-batch:disabled { cursor: not-allowed; opacity: .52; transform: none; box-shadow: none; }

/* ===== 整门课提取进度（主面板内） ===== */
#xxt-panel .xxt-batch-live {
  margin:-2px 0 12px; padding:11px 12px; border:1px solid rgba(91,58,216,.32);
  border-radius:14px; background:var(--xxt-grad-soft); color:var(--xxt-text); box-sizing:border-box;
}
#xxt-panel .xxt-batch-live-head { display:flex; align-items:center; justify-content:space-between; gap:8px; }
#xxt-panel .xxt-batch-live-title { font-size:12.5px; font-weight:800; }
#xxt-panel .xxt-batch-live-state { flex:0 0 auto; padding:3px 7px; border-radius:99px; background:rgba(91,58,216,.12); color:var(--xxt-accent-strong); font-size:10.5px; font-weight:800; }
#xxt-panel .xxt-batch-live-state.is-paused { background:rgba(245,158,11,.14); color:#b45309; }
#xxt-panel .xxt-batch-live-state.is-done { background:rgba(16,185,129,.14); color:#047857; }
#xxt-panel .xxt-batch-live-current { margin-top:8px; color:var(--xxt-accent-strong); font-size:12px; font-weight:800; line-height:1.45; }
#xxt-panel .xxt-batch-live-detail { margin-top:3px; color:var(--xxt-text-soft); font-size:10.8px; line-height:1.45; }
#xxt-panel .xxt-batch-live-bar { height:6px; margin:9px 0 10px; overflow:hidden; border-radius:99px; background:rgba(91,58,216,.16); }
#xxt-panel .xxt-batch-live-bar > i { display:block; width:0; height:100%; border-radius:inherit; background:var(--xxt-grad); transition:width .25s ease; }
#xxt-panel .xxt-batch-live-actions { display:flex; flex-wrap:wrap; gap:7px; }
#xxt-panel .xxt-batch-live-actions button { flex:1 1 92px; border:1px solid var(--xxt-accent); border-radius:9px; padding:7px 9px; background:#fff; color:var(--xxt-accent-strong); cursor:pointer; font:800 11px/1.3 inherit; }
#xxt-panel .xxt-batch-live-actions button:hover { border-color:transparent; background:var(--xxt-grad); color:#fff; }
#xxt-panel .xxt-batch-live-actions button[data-batch-live-stop] { border-color:#ef4444; color:#dc2626; }
#xxt-panel .xxt-batch-live-actions button[data-batch-live-stop]:hover { background:#ef4444; }
#xxt-panel .xxt-batch-live-actions button:disabled { opacity:.5; cursor:not-allowed; }
#xxt-panel .xxt-batch-live-log { margin-top:9px; border-top:1px solid rgba(91,58,216,.18); padding-top:8px; }
#xxt-panel .xxt-batch-live-log summary { color:var(--xxt-text-soft); cursor:pointer; font-size:11px; font-weight:800; list-style:none; user-select:none; }
#xxt-panel .xxt-batch-live-log summary::-webkit-details-marker { display:none; }
#xxt-panel .xxt-batch-live-log summary::before { content:'›'; display:inline-block; margin-right:5px; color:var(--xxt-accent); font-size:14px; line-height:0; transform:rotate(0deg); transition:transform .18s ease; }
#xxt-panel .xxt-batch-live-log[open] summary::before { transform:rotate(90deg); }
#xxt-panel .xxt-batch-live-log-list { max-height:134px; margin-top:7px; overflow:auto; padding-right:3px; }
#xxt-panel .xxt-batch-log-item { display:grid; grid-template-columns:auto 1fr; gap:6px; padding:4px 0; color:var(--xxt-text-soft); font-size:10.5px; line-height:1.45; }
#xxt-panel .xxt-batch-log-item + .xxt-batch-log-item { border-top:1px dashed rgba(91,58,216,.13); }
#xxt-panel .xxt-batch-log-time { color:#9ca3af; font-variant-numeric:tabular-nums; white-space:nowrap; }
#xxt-panel .xxt-batch-log-item.is-warn { color:#b45309; }
#xxt-panel .xxt-batch-log-item.is-error { color:#dc2626; }

/* ===== 状态提示（药丸标签） ===== */
#xxt-panel .xxt-status {
  text-align: center; padding: 10px 14px; font-size: 12.5px;
  margin-bottom: 12px; border-radius: 12px; font-weight: 600;
  letter-spacing: 0.3px;
}
.xxt-status-ok { color: #047857; background: rgba(16,185,129,0.12); border: 1px solid rgba(16,185,129,0.25); }
.xxt-status-loading { color: #2563eb; background: rgba(59,130,246,0.10); border: 1px solid rgba(59,130,246,0.22); }
.xxt-status-err { color: #dc2626; background: rgba(239,68,68,0.10); border: 1px solid rgba(239,68,68,0.22); }
.xxt-status-warn { color: #b45309; background: rgba(245,158,11,0.12); border: 1px solid rgba(245,158,11,0.25); }

/* ===== 统计卡片（渐变描边） ===== */
#xxt-panel .xxt-stat {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 9px;
  margin: 14px 0 16px;
}
#xxt-panel .xxt-stat-item {
  text-align: center; padding: 12px 4px 9px;
  background: var(--xxt-surface-solid); border-radius: 14px;
  border: 1px solid var(--xxt-border);
  box-shadow: 0 4px 12px -6px rgba(15,23,42,0.12);
  transition: transform 0.25s ease, box-shadow 0.25s ease;
}
#xxt-panel .xxt-stat-item:hover {
  transform: translateY(-3px);
  box-shadow: 0 10px 20px -8px rgba(124,92,240,0.4);
}
#xxt-panel .xxt-stat-item .xxt-num {
  font-size: 23px; font-weight: 800; line-height: 1.15;
  background: var(--xxt-grad);
  -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent;
}
#xxt-panel .xxt-stat-item .xxt-label {
  font-size: 11px; color: #4b5563; margin-top: 3px; font-weight: 600;
}

/* ===== 分隔区块（柔和卡片） ===== */
#xxt-panel .xxt-section {
  background: var(--xxt-surface-solid); border-radius: 16px; padding: 14px 16px;
  border: 1px solid var(--xxt-border); margin-top: 12px;
  box-shadow: 0 4px 14px -8px rgba(15,23,42,0.08);
}

/* ===== 文件名输入 ===== */
#xxt-panel .xxt-filename {
  width: 100%; padding: 11px 14px; border: 1.5px solid var(--xxt-border);
  border-radius: 12px; font-size: 12.5px; color: var(--xxt-text);
  box-sizing: border-box; outline: none; transition: all 0.22s ease;
  background: #fff;
}
#xxt-panel .xxt-filename::placeholder { color: #b6bcc8; }
#xxt-panel .xxt-filename:focus {
  border-color: var(--xxt-accent);
  box-shadow: 0 0 0 4px rgba(124,92,240,0.14);
}

/* ===== 格式选择（胶囊分段） ===== */
#xxt-panel .xxt-format-row {
  display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 12px;
  font-size: 12.5px; color: #4b5563; font-weight: 600;
}
#xxt-panel .xxt-format-row label {
  cursor: pointer; display: inline-flex; align-items: center; gap: 5px;
  padding: 6px 16px; border-radius: 20px; border: 1.5px solid var(--xxt-border);
  background: #fff; transition: all 0.22s cubic-bezier(.4,0,.2,1); font-size: 12px;
}
#xxt-panel .xxt-format-row label:hover { border-color: rgba(124,92,240,0.4); transform: translateY(-1px); }
#xxt-panel .xxt-format-row input[type="radio"] {
  width: 14px; height: 14px; cursor: pointer; accent-color: var(--xxt-accent);
}
#xxt-panel .xxt-format-row label:has(input:checked) {
  color: #fff; border-color: transparent; background: var(--xxt-grad);
  box-shadow: 0 6px 14px -6px rgba(124,92,240,0.6);
}

/* ===== 操作按钮组 ===== */
#xxt-panel .xxt-actions {
  display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 14px;
}
#xxt-panel .xxt-actions .xxt-btn {
  padding: 11px; border-radius: 14px; font-size: 13px; font-weight: 700;
  transition: all 0.24s ease;
}
#xxt-panel .xxt-selection-summary {
  margin: -2px 0 11px; padding: 8px 10px; border-radius: 10px;
  background: rgba(15,23,42,.035); color: var(--xxt-text-soft); font-size: 11px; font-weight: 700;
}
#xxt-panel .xxt-selection-summary.xxt-selection-limited { background: rgba(124,92,240,.10); color: var(--xxt-accent-strong); }
.xxt-btn-outline {
  background: #fff; color: var(--xxt-accent-strong);
  border: 1.5px solid var(--xxt-accent) !important;
}
.xxt-btn-outline:hover {
  background: var(--xxt-grad); color: #fff; border-color: transparent !important;
  box-shadow: 0 8px 18px -8px rgba(124,92,240,0.6); transform: translateY(-1px);
}

/* ===== 开关选项（复选框） ===== */
#xxt-panel .xxt-toggle {
  display: flex; align-items: flex-start; gap: 11px; margin-top: 12px;
  padding: 12px 14px; border-radius: 14px;
  background: var(--xxt-surface-solid); border: 1px solid var(--xxt-border);
  cursor: pointer; transition: all 0.22s ease;
}
#xxt-panel .xxt-toggle:hover { border-color: rgba(124,92,240,0.35); transform: translateX(2px); }
#xxt-panel .xxt-toggle .xxt-checkbox-wrap {
  flex-shrink: 0; width: 20px; height: 20px; margin-top: 1px;
  border: 2px solid #cbd5e1; border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.22s cubic-bezier(.34,1.56,.64,1); background: #fff;
}
#xxt-panel .xxt-toggle input { display: none; }
#xxt-panel .xxt-toggle input:checked + .xxt-checkbox-wrap {
  background: var(--xxt-grad); border-color: transparent;
  box-shadow: 0 4px 10px -3px rgba(124,92,240,0.6);
}
#xxt-panel .xxt-toggle input:checked + .xxt-checkbox-wrap::after {
  content: ''; width: 5px; height: 10px;
  border: solid #fff; border-width: 0 2.5px 2.5px 0;
  transform: rotate(45deg) translateY(-1px);
}
#xxt-panel .xxt-toggle span {
  font-size: 12.5px; color: #1f2937; line-height: 1.5; font-weight: 600;
}
/* 题库导入勾选时禁用打乱/答案选项，不隐藏 */
#xxt-panel .xxt-toggle.xxt-disabled {
  opacity: 0.45; pointer-events: none; user-select: none;
}

/* ===== 错题提示 ===== */
#xxt-panel .xxt-wrong-hint {
  font-size: 11.5px; color: #dc2626; margin-top: 10px;
  padding: 10px 14px; background: rgba(239,68,68,0.08); border-radius: 12px;
  border: 1px solid rgba(239,68,68,0.2); font-weight: 600;
  animation: xxt-shake 0.4s ease-in-out;
}
@keyframes xxt-shake {
  0%,100% { transform: translateX(0); }
  25% { transform: translateX(-3px); }
  50% { transform: translateX(3px); }
  75% { transform: translateX(-2px); }
}

.xxt-hidden { display: none !important; }

/* ===== QQ 群反馈入口 ===== */
#xxt-panel .xxt-feedback-link {
  display: inline-flex; align-items: center; justify-content: center;
  height: 28px; padding: 0 8px; border-radius: 9px;
  background: linear-gradient(135deg, #12b7f5, #1286e8);
  color: #fff !important; text-decoration: none;
  font-size: 11px; font-weight: 700; white-space: nowrap;
  box-shadow: 0 4px 10px -5px rgba(18,134,232,0.75);
  transition: all 0.22s ease;
}
#xxt-panel .xxt-feedback-link:hover {
  filter: brightness(1.08); transform: translateY(-1px);
  box-shadow: 0 7px 14px -6px rgba(18,134,232,0.85);
}
#xxt-panel .xxt-feedback-link:active { transform: translateY(0) scale(0.97); }

/* ===== 设置齿轮图标 ===== */
#xxt-panel .xxt-settings-btn {
  width: 28px; height: 28px; border: none;
  background: rgba(15,23,42,0.05);
  border-radius: 50%; cursor: pointer; display: flex; align-items: center;
  justify-content: center; transition: all 0.25s ease; margin-right: 4px;
  color: #9ca3af; padding: 0;
}
#xxt-panel .xxt-settings-btn:hover { background: rgba(124,92,240,0.14); color: var(--xxt-accent); transform: rotate(40deg); }
#xxt-panel .xxt-settings-btn svg { width: 16px; height: 16px; fill: currentColor; }

/* 所有脚本浮窗都可从标题栏拖动；表单控件和关闭按钮仍保持正常点击。 */
#xxt-panel.xxt-draggable .xxt-header,
#xxt-settings-modal .xxt-draggable .xxt-modal-header,
#xxt-history-modal .xxt-draggable .xxt-modal-header,
#xxt-batch-modal .xxt-draggable .xxt-modal-header,
#xxt-bank-modal .xxt-draggable .xxt-modal-header,
#xxt-save-bank-modal .xxt-draggable .xxt-modal-header,
#xxt-preview-modal .xxt-draggable .xxt-modal-header,
#xxt-editor-modal .xxt-draggable .xxt-modal-header,
#xxt-batch-progress-card.xxt-draggable .xxt-batch-card-head { cursor: grab; touch-action: none; user-select: none; }
.xxt-dragging, .xxt-dragging * { cursor: grabbing !important; }

/* ===== 设置弹窗遮罩 ===== */
#xxt-settings-modal {
  position: fixed; inset: 0; z-index: 100000;
  background: rgba(15,23,42,0.42);
  backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  opacity: 0; pointer-events: none;
  transition: opacity 0.28s ease;
}
#xxt-settings-modal.open { opacity: 1; pointer-events: auto; }

/* ===== 设置弹窗主体 ===== */
#xxt-settings-modal .xxt-modal-box {
  background: #ffffff;
  border: 1px solid var(--xxt-border);
  border-radius: 22px; width: 348px;
  padding: 26px; box-shadow: var(--xxt-shadow);
  transform: translateY(16px) scale(0.97); transition: transform 0.3s cubic-bezier(.16,1,.3,1);
  color: var(--xxt-text);
}
#xxt-settings-modal.open .xxt-modal-box { transform: translateY(0) scale(1); }
#xxt-settings-modal .xxt-modal-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 20px; padding-bottom: 16px;
  border-bottom: 1px solid var(--xxt-border);
}
#xxt-settings-modal .xxt-modal-header h3 {
  font-size: 16px; font-weight: 800; color: var(--xxt-text); margin: 0;
  background: var(--xxt-grad); -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent;
}
#xxt-settings-modal .xxt-modal-close {
  width: 28px; height: 28px; border: none; background: rgba(15,23,42,0.05);
  border-radius: 50%; font-size: 15px; color: #9ca3af; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.22s ease;
}
#xxt-settings-modal .xxt-modal-close:hover { background: #ef4444; color: #fff; transform: rotate(90deg); }

/* ===== 设置弹窗内容行 ===== */
#xxt-settings-modal .xxt-setting-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 14px; border-radius: 14px;
  background: var(--xxt-surface-solid); border: 1px solid var(--xxt-border);
  margin-bottom: 10px; font-size: 13px; color: #1f2937; font-weight: 600;
  box-shadow: 0 3px 10px -6px rgba(15,23,42,0.08);
}
#xxt-settings-modal .xxt-setting-label { font-weight: 600; white-space: nowrap; }
#xxt-settings-modal .xxt-theme-group { display: flex; gap: 6px; }
#xxt-settings-modal .xxt-theme-btn {
  padding: 5px 14px; border-radius: 18px; border: 1.5px solid var(--xxt-border);
  background: #fff; color: var(--xxt-text-soft); font-size: 11px; cursor: pointer;
  transition: all 0.22s ease; font-weight: 600;
}
#xxt-settings-modal .xxt-theme-btn:hover { border-color: rgba(124,92,240,0.4); color: var(--xxt-accent); }
#xxt-settings-modal .xxt-theme-btn.active {
  background: var(--xxt-grad); color: #fff; border-color: transparent;
  box-shadow: 0 6px 14px -6px rgba(124,92,240,0.6);
}
#xxt-settings-modal .xxt-shortcut-display {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 12px; border-radius: 10px;
  background: rgba(124,92,240,0.08); border: 1px solid rgba(124,92,240,0.2);
  cursor: pointer; transition: all 0.22s ease; font-size: 12px; color: #4b5563;
}
#xxt-settings-modal .xxt-shortcut-display:hover { border-color: var(--xxt-accent); }
#xxt-settings-modal .xxt-shortcut-keys {
  color: var(--xxt-accent-strong); font-weight: 700; font-family: ui-monospace, monospace;
  padding: 2px 8px; background: rgba(124,92,240,0.12); border-radius: 6px;
}
#xxt-settings-modal .xxt-shortcut-hint { color: #9ca3af; font-size: 11px; }

/* ===== 历史记录弹窗 ===== */
#xxt-history-modal {
  position: fixed; inset: 0; z-index: 100001;
  background: rgba(15,23,42,0.42); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  opacity: 0; pointer-events: none; transition: opacity 0.28s ease;
}
#xxt-history-modal.open { opacity: 1; pointer-events: auto; }
#xxt-history-modal .xxt-modal-box {
  background: #ffffff;
  border: 1px solid var(--xxt-border);
  border-radius: 22px; width: 420px; max-height: 540px;
  padding: 26px; box-shadow: var(--xxt-shadow);
  transform: translateY(16px) scale(0.97); transition: transform 0.3s cubic-bezier(.16,1,.3,1);
  display: flex; flex-direction: column;
  color: var(--xxt-text);
}
#xxt-history-modal.open .xxt-modal-box { transform: translateY(0) scale(1); }
#xxt-history-modal .xxt-modal-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 16px; padding-bottom: 14px;
  border-bottom: 1px solid var(--xxt-border); flex-shrink: 0;
}
#xxt-history-modal .xxt-modal-header h3 {
  font-size: 16px; font-weight: 800; color: var(--xxt-text); margin: 0;
  background: var(--xxt-grad); -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent;
}
#xxt-history-modal .xxt-modal-close {
  width: 28px; height: 28px; border: none; background: rgba(15,23,42,0.05);
  border-radius: 50%; font-size: 15px; color: #9ca3af; cursor: pointer;
  display: flex; align-items: center; justify-content: center; transition: all 0.22s ease;
}
#xxt-history-modal .xxt-modal-close:hover { background: #ef4444; color: #fff; transform: rotate(90deg); }
#xxt-history-modal .xxt-history-list { flex: 1; overflow-y: auto; }
#xxt-history-modal .xxt-history-list::-webkit-scrollbar { width: 6px; }
#xxt-history-modal .xxt-history-list::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, #c4b5fd, #f0abfc); border-radius: 6px;
}
#xxt-history-modal .xxt-history-empty {
  text-align: center; color: #aab1c0; padding: 48px 0; font-size: 13px; font-weight: 500;
}
#xxt-history-modal .xxt-history-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px; border-radius: 16px;
  background: var(--xxt-surface-solid); border: 1px solid var(--xxt-border);
  margin-bottom: 10px; transition: all 0.22s ease; cursor: pointer;
  box-shadow: 0 3px 10px -6px rgba(15,23,42,0.08);
}
#xxt-history-modal .xxt-history-item:hover {
  border-color: rgba(124,92,240,0.4);
  transform: translateY(-2px);
  box-shadow: 0 10px 22px -10px rgba(124,92,240,0.45);
}
#xxt-history-modal .xxt-history-info { flex: 1; min-width: 0; }
#xxt-history-modal .xxt-history-title {
  font-size: 13px; font-weight: 700; color: #374151;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
#xxt-history-modal .xxt-history-meta {
  font-size: 11px; color: #9ca3af; margin-top: 4px; font-weight: 500;
}
#xxt-history-modal .xxt-history-delete {
  width: 30px; height: 30px; border: none; background: transparent;
  border-radius: 50%; cursor: pointer; color: #cbd5e1; font-size: 16px;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.22s ease; flex-shrink: 0; margin-left: 8px;
}
#xxt-history-modal .xxt-history-delete:hover { background: rgba(239,68,68,0.12); color: #ef4444; }
#xxt-history-modal .xxt-history-download {
  width: 30px; height: 30px; border: none; background: transparent;
  border-radius: 50%; cursor: pointer; color: #cbd5e1; font-size: 14px;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.22s ease; flex-shrink: 0; margin-left: 4px;
}
#xxt-history-modal .xxt-history-download:hover { background: rgba(124,92,240,0.14); color: var(--xxt-accent); }

/* ===== 整门课章节测验批量提取 ===== */
#xxt-batch-modal {
  position:fixed; inset:0; z-index:100006; background:rgba(15,23,42,.42); backdrop-filter:blur(4px);
  display:flex; align-items:center; justify-content:center; opacity:0; pointer-events:none; transition:opacity .28s ease;
}
#xxt-batch-modal.open { opacity:1; pointer-events:auto; }
#xxt-batch-modal .xxt-batch-box {
  width:min(620px,94vw); max-height:88vh; padding:22px; box-sizing:border-box; background:#fff;
  border:1px solid var(--xxt-border); border-radius:22px; box-shadow:var(--xxt-shadow); color:var(--xxt-text);
  display:flex; flex-direction:column; transform:translateY(16px) scale(.97); transition:transform .3s cubic-bezier(.16,1,.3,1);
}
#xxt-batch-modal.open .xxt-batch-box { transform:translateY(0) scale(1); }
#xxt-batch-modal .xxt-modal-header { display:flex; align-items:center; justify-content:space-between; padding-bottom:14px; margin-bottom:12px; border-bottom:1px solid var(--xxt-border); }
#xxt-batch-modal .xxt-modal-header h3 { margin:0; font-size:16px; font-weight:800; color:var(--xxt-text); }
#xxt-batch-modal .xxt-modal-close { width:28px; height:28px; border:0; border-radius:50%; background:rgba(15,23,42,.05); color:#9ca3af; cursor:pointer; font-size:15px; }
#xxt-batch-modal .xxt-modal-close:hover { background:#ef4444; color:#fff; }
#xxt-batch-modal .xxt-batch-note { padding:10px 12px; margin-bottom:11px; border-radius:11px; background:var(--xxt-grad-soft); color:var(--xxt-text-soft); font-size:12px; line-height:1.6; }
#xxt-batch-modal .xxt-batch-toolbar { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:10px; }
#xxt-batch-modal .xxt-batch-toolbar button, #xxt-batch-modal .xxt-batch-actions button {
  border:1px solid var(--xxt-accent); border-radius:9px; padding:8px 11px; background:#fff; color:var(--xxt-accent-strong); cursor:pointer; font:700 12px/1.35 inherit;
}
#xxt-batch-modal .xxt-batch-toolbar button:hover, #xxt-batch-modal .xxt-batch-actions button:hover { background:var(--xxt-grad); color:#fff; border-color:transparent; }
#xxt-batch-modal .xxt-batch-toolbar button:disabled, #xxt-batch-modal .xxt-batch-actions button:disabled { cursor:not-allowed; opacity:.48; }
#xxt-batch-modal .xxt-batch-list { overflow:auto; min-height:110px; max-height:46vh; padding:2px 4px 6px 0; }
#xxt-batch-modal .xxt-batch-empty { padding:32px 10px; color:#9ca3af; text-align:center; font-size:12px; line-height:1.7; }
#xxt-batch-modal .xxt-batch-item { display:flex; gap:10px; align-items:center; padding:10px 11px; margin-bottom:7px; border:1px solid var(--xxt-border); border-radius:12px; background:var(--xxt-surface-solid); transition:all .2s ease; }
#xxt-batch-modal .xxt-batch-item:hover { border-color:rgba(124,92,240,.42); }
#xxt-batch-modal .xxt-batch-item input { width:16px; height:16px; flex:0 0 auto; accent-color:var(--xxt-accent); cursor:pointer; }
#xxt-batch-modal .xxt-batch-item-main { min-width:0; flex:1; }
#xxt-batch-modal .xxt-batch-item-title { color:var(--xxt-text); font-size:12.5px; line-height:1.45; font-weight:700; }
#xxt-batch-modal .xxt-batch-item-meta { margin-top:3px; color:#9ca3af; font-size:10.5px; line-height:1.35; }
#xxt-batch-modal .xxt-batch-item-state { flex:0 0 auto; color:#9ca3af; font-size:11px; font-weight:700; }
#xxt-batch-modal .xxt-batch-item.is-current { border-color:rgba(124,92,240,.6); background:var(--xxt-grad-soft); }
#xxt-batch-modal .xxt-batch-item.is-current .xxt-batch-item-state { color:var(--xxt-accent-strong); }
#xxt-batch-modal .xxt-batch-item.is-done { border-color:rgba(16,185,129,.32); }
#xxt-batch-modal .xxt-batch-item.is-done .xxt-batch-item-state { color:#047857; }
#xxt-batch-modal .xxt-batch-item.is-failed { border-color:rgba(245,158,11,.38); }
#xxt-batch-modal .xxt-batch-item.is-failed .xxt-batch-item-state { color:#b45309; }
#xxt-batch-modal .xxt-batch-actions { display:flex; align-items:center; justify-content:space-between; gap:10px; padding-top:13px; margin-top:5px; border-top:1px solid var(--xxt-border); }
#xxt-batch-modal .xxt-batch-actions .xxt-batch-stop { border-color:#ef4444; color:#dc2626; }
#xxt-batch-modal .xxt-batch-actions .xxt-batch-stop:hover { background:#ef4444; color:#fff; }
#xxt-batch-modal .xxt-batch-progress { flex:1; min-width:0; color:var(--xxt-text-soft); font-size:11px; line-height:1.45; }

/* 批量运行时不遮挡学习通页面：进度固定在右侧，用户仍可观察题目加载。 */
#xxt-batch-progress-card {
  position:fixed; top:148px; right:18px; z-index:100007; width:min(310px,calc(100vw - 36px));
  box-sizing:border-box; padding:14px 15px; border:1px solid rgba(124,92,240,.35);
  border-radius:16px; background:rgba(255,255,255,.96); backdrop-filter:blur(18px);
  box-shadow:0 16px 38px rgba(49,46,129,.20); color:var(--xxt-text); display:none;
}
#xxt-batch-progress-card.open { display:block; }
#xxt-batch-progress-card .xxt-batch-card-head { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:8px; }
#xxt-batch-progress-card .xxt-batch-card-title { font-size:13px; font-weight:800; }
#xxt-batch-progress-card .xxt-batch-card-close { width:24px; height:24px; border:0; border-radius:50%; background:rgba(15,23,42,.06); color:#9ca3af; cursor:pointer; }
#xxt-batch-progress-card .xxt-batch-card-note { padding:8px 9px; margin-bottom:9px; border-radius:9px; background:var(--xxt-grad-soft); color:var(--xxt-text-soft); font-size:11px; line-height:1.5; }
#xxt-batch-progress-card .xxt-batch-card-current { color:var(--xxt-accent-strong); font-size:12px; font-weight:700; line-height:1.45; word-break:break-word; }
#xxt-batch-progress-card .xxt-batch-card-detail { margin-top:4px; color:var(--xxt-text-soft); font-size:11px; line-height:1.45; }
#xxt-batch-progress-card .xxt-batch-card-bar { height:6px; margin:10px 0 8px; overflow:hidden; border-radius:99px; background:#ede9fe; }
#xxt-batch-progress-card .xxt-batch-card-bar > i { display:block; width:0; height:100%; border-radius:inherit; background:var(--xxt-grad); transition:width .25s ease; }
#xxt-batch-progress-card .xxt-batch-card-actions { display:flex; justify-content:flex-end; gap:8px; }
#xxt-batch-progress-card button[data-batch-card-stop] { border:1px solid #ef4444; border-radius:8px; padding:6px 10px; background:#fff; color:#dc2626; cursor:pointer; font:700 11px/1.3 inherit; }
#xxt-batch-progress-card button[data-batch-card-stop]:hover { background:#ef4444; color:#fff; }
[data-xxt-theme="dark"] #xxt-batch-progress-card { background:rgba(30,30,46,.96); border-color:rgba(167,139,250,.45); }
[data-xxt-theme="dark"] #xxt-batch-progress-card .xxt-batch-card-close { background:rgba(205,214,244,.08); color:#a6adc8; }
[data-xxt-theme="dark"] #xxt-batch-progress-card button[data-batch-card-stop] { background:#181825; color:#f87171; border-color:#f87171; }

/* ===== 题库区弹窗 ===== */
#xxt-bank-modal {
  position: fixed; inset: 0; z-index: 100003;
  background: rgba(15,23,42,0.42); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  opacity: 0; pointer-events: none; transition: opacity .28s ease;
}
#xxt-bank-modal.open { opacity: 1; pointer-events: auto; }
#xxt-bank-modal .xxt-bank-box {
  background:#fff; border:1px solid var(--xxt-border); border-radius:22px;
  width:min(980px,94vw); max-height:90vh; padding:22px; box-shadow:var(--xxt-shadow);
  color:var(--xxt-text); transform:translateY(16px) scale(.97);
  transition:transform .3s cubic-bezier(.16,1,.3,1); display:flex; flex-direction:column;
}
#xxt-bank-modal.open .xxt-bank-box { transform:translateY(0) scale(1); }
#xxt-bank-modal .xxt-modal-header { display:flex; align-items:center; justify-content:space-between; padding-bottom:14px; margin-bottom:12px; border-bottom:1px solid var(--xxt-border); }
#xxt-bank-modal .xxt-modal-header h3 { margin:0; font-size:16px; font-weight:800; color:var(--xxt-text); }
#xxt-bank-modal .xxt-modal-close { width:28px; height:28px; border:0; border-radius:50%; background:rgba(15,23,42,.05); color:#9ca3af; cursor:pointer; font-size:15px; }
#xxt-bank-modal .xxt-modal-close:hover { background:#ef4444; color:#fff; }
#xxt-bank-modal .xxt-bank-toolbar { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-bottom:12px; }
#xxt-bank-modal select, #xxt-bank-modal input[type="text"], #xxt-bank-modal input[type="number"] { box-sizing:border-box; border:1px solid var(--xxt-border); border-radius:9px; padding:8px 10px; background:#fff; color:var(--xxt-text); font:12px/1.4 inherit; }
#xxt-bank-modal select { flex:1 1 220px; min-width:180px; }
#xxt-bank-modal .xxt-bank-btn { border:1px solid var(--xxt-accent); background:#fff; color:var(--xxt-accent-strong); border-radius:9px; padding:8px 11px; cursor:pointer; font-size:12px; font-weight:700; }
#xxt-bank-modal .xxt-bank-btn:hover { background:var(--xxt-grad); color:#fff; border-color:transparent; }
#xxt-bank-modal .xxt-bank-btn.xxt-danger { border-color:#ef4444; color:#dc2626; }
#xxt-bank-modal .xxt-bank-btn.xxt-danger:hover { background:#ef4444; color:#fff; }
#xxt-bank-modal .xxt-bank-info { padding:10px 12px; border-radius:11px; background:var(--xxt-grad-soft); color:var(--xxt-text-soft); font-size:12px; margin-bottom:10px; }
#xxt-bank-modal .xxt-bank-search { display:flex; gap:8px; margin-bottom:10px; }
#xxt-bank-modal .xxt-bank-search input { flex:1; }
#xxt-bank-modal .xxt-bank-list { overflow:auto; min-height:120px; max-height:52vh; padding:2px 4px 8px 0; }
#xxt-bank-modal .xxt-bank-type-group { margin:0 0 15px; }
#xxt-bank-modal .xxt-bank-type-head { display:flex; align-items:baseline; justify-content:space-between; gap:10px; padding:7px 3px 8px; margin-bottom:8px; border-bottom:1px solid var(--xxt-border); }
#xxt-bank-modal .xxt-bank-type-title { color:var(--xxt-accent-strong); font-size:14px; font-weight:800; }
#xxt-bank-modal .xxt-bank-type-count { color:var(--xxt-text-soft); font-size:11px; white-space:nowrap; }
#xxt-bank-modal .xxt-bank-card { border:1px solid var(--xxt-border); border-radius:13px; padding:11px 12px; margin-bottom:8px; background:var(--xxt-surface-solid); }
#xxt-bank-modal .xxt-bank-card-head { display:flex; justify-content:space-between; gap:8px; align-items:center; margin-bottom:8px; }
#xxt-bank-modal .xxt-bank-card-number { display:inline-flex; align-items:center; min-height:22px; padding:0 8px; border-radius:999px; background:var(--xxt-grad-soft); color:var(--xxt-accent-strong); font-size:11px; font-weight:800; }
#xxt-bank-modal .xxt-bank-card-meta { color:var(--xxt-text-soft); font-size:11px; }
#xxt-bank-modal .xxt-bank-question-stem { color:var(--xxt-text); font-size:13px; font-weight:700; line-height:1.65; white-space:normal; overflow-wrap:anywhere; }
#xxt-bank-modal .xxt-bank-options { display:grid; gap:5px; margin-top:9px; padding:8px 9px; border-radius:9px; background:rgba(91,58,216,.055); }
#xxt-bank-modal .xxt-bank-options-label { color:var(--xxt-text-soft); font-size:10px; font-weight:800; letter-spacing:.04em; }
#xxt-bank-modal .xxt-bank-option { display:grid; grid-template-columns:26px minmax(0,1fr); gap:5px; color:var(--xxt-text); font-size:12px; line-height:1.6; overflow-wrap:anywhere; }
#xxt-bank-modal .xxt-bank-option-letter { color:var(--xxt-accent-strong); font-weight:800; }
#xxt-bank-modal .xxt-bank-option-text { min-width:0; }
#xxt-bank-modal .xxt-bank-no-options { margin-top:9px; color:var(--xxt-text-soft); font-size:11px; }
#xxt-bank-modal .xxt-bank-answer { display:grid; grid-template-columns:38px minmax(0,1fr); gap:7px; align-items:start; margin-top:9px; padding:8px 9px; border:1px solid rgba(16,185,129,.28); border-radius:9px; background:rgba(16,185,129,.08); color:#047857; font-size:12px; line-height:1.6; overflow-wrap:anywhere; }
#xxt-bank-modal .xxt-bank-answer-label { font-weight:800; }
#xxt-bank-modal .xxt-bank-answer-value { min-width:0; font-weight:700; }
#xxt-bank-modal .xxt-bank-muted { color:var(--xxt-text-soft); font-weight:500; }
#xxt-bank-modal .xxt-bank-card-actions { display:flex; gap:5px; flex-wrap:wrap; margin-top:8px; }
#xxt-bank-modal .xxt-bank-card-actions button { border:1px solid var(--xxt-border); border-radius:7px; padding:5px 8px; background:transparent; color:var(--xxt-text-soft); cursor:pointer; font-size:11px; }
#xxt-bank-modal .xxt-bank-card-actions button:hover { border-color:var(--xxt-accent); color:var(--xxt-accent-strong); }
#xxt-bank-modal .xxt-bank-empty { text-align:center; color:#9ca3af; padding:34px 0; font-size:12px; }
#xxt-bank-modal .xxt-bank-pagination { display:flex; align-items:center; justify-content:center; gap:9px; padding:10px 0 4px; color:var(--xxt-text-soft); font-size:11px; }
#xxt-bank-modal .xxt-bank-pagination button { min-width:54px; border:1px solid var(--xxt-border); border-radius:7px; padding:5px 8px; background:transparent; color:var(--xxt-text-soft); cursor:pointer; font:inherit; }
#xxt-bank-modal .xxt-bank-pagination button:hover:not(:disabled) { border-color:var(--xxt-accent); color:var(--xxt-accent-strong); }
#xxt-bank-modal .xxt-bank-pagination button:disabled { opacity:.42; cursor:not-allowed; }
#xxt-bank-modal .xxt-bank-compare { display:flex; gap:8px; align-items:center; flex-wrap:wrap; padding-top:10px; border-top:1px solid var(--xxt-border); }
#xxt-bank-modal .xxt-bank-compare-status { width:100%; color:var(--xxt-text-soft); font-size:11px; white-space:pre-wrap; }

/* ===== 存入题库引导弹窗 ===== */
#xxt-save-bank-modal {
  position:fixed; inset:0; z-index:100005;
  background:rgba(15,23,42,.42); backdrop-filter:blur(4px);
  display:flex; align-items:center; justify-content:center;
  opacity:0; pointer-events:none; transition:opacity .28s ease;
}
#xxt-save-bank-modal.open { opacity:1; pointer-events:auto; }
#xxt-save-bank-modal .xxt-save-bank-box {
  width:min(440px,94vw); padding:22px; box-sizing:border-box;
  background:#fff; border:1px solid var(--xxt-border); border-radius:22px;
  box-shadow:var(--xxt-shadow); color:var(--xxt-text);
  transform:translateY(16px) scale(.97); transition:transform .3s cubic-bezier(.16,1,.3,1);
}
#xxt-save-bank-modal.open .xxt-save-bank-box { transform:translateY(0) scale(1); }
#xxt-save-bank-modal .xxt-modal-header { display:flex; align-items:center; justify-content:space-between; padding-bottom:14px; margin-bottom:12px; border-bottom:1px solid var(--xxt-border); }
#xxt-save-bank-modal .xxt-modal-header h3 { margin:0; font-size:16px; font-weight:800; color:var(--xxt-text); }
#xxt-save-bank-modal .xxt-modal-close { width:28px; height:28px; border:0; border-radius:50%; background:rgba(15,23,42,.05); color:#9ca3af; cursor:pointer; font-size:15px; }
#xxt-save-bank-modal .xxt-modal-close:hover { background:#ef4444; color:#fff; }
#xxt-save-bank-modal .xxt-save-bank-summary { margin:0 0 14px; padding:10px 12px; border-radius:11px; background:var(--xxt-grad-soft); color:var(--xxt-text-soft); font-size:12px; line-height:1.6; }
#xxt-save-bank-modal .xxt-save-bank-mode { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:13px; }
#xxt-save-bank-modal .xxt-save-bank-mode button { border:1px solid var(--xxt-border); border-radius:10px; padding:9px 8px; background:var(--xxt-surface-solid); color:var(--xxt-text-soft); cursor:pointer; font:700 12px/1.35 inherit; transition:all .2s ease; }
#xxt-save-bank-modal .xxt-save-bank-mode button:hover { border-color:var(--xxt-accent); color:var(--xxt-accent-strong); }
#xxt-save-bank-modal .xxt-save-bank-mode button.active { border-color:transparent; background:var(--xxt-grad); color:#fff; box-shadow:0 6px 14px -7px rgba(99,102,241,.7); }
#xxt-save-bank-modal .xxt-save-bank-field { margin-bottom:12px; }
#xxt-save-bank-modal .xxt-save-bank-field label { display:block; margin-bottom:6px; color:var(--xxt-text-soft); font-size:12px; font-weight:700; }
#xxt-save-bank-modal select, #xxt-save-bank-modal input { box-sizing:border-box; width:100%; border:1px solid var(--xxt-border); border-radius:9px; padding:9px 10px; background:#fff; color:var(--xxt-text); font:13px/1.4 inherit; outline:0; }
#xxt-save-bank-modal select:focus, #xxt-save-bank-modal input:focus { border-color:var(--xxt-accent); box-shadow:0 0 0 3px rgba(124,92,240,.14); }
#xxt-save-bank-modal .xxt-save-bank-hint { min-height:18px; margin:0 0 14px; color:var(--xxt-text-soft); font-size:11px; line-height:1.55; }
#xxt-save-bank-modal .xxt-save-bank-actions { display:flex; justify-content:flex-end; gap:10px; padding-top:14px; border-top:1px solid var(--xxt-border); }
#xxt-save-bank-modal .xxt-save-bank-actions button { border-radius:10px; padding:9px 18px; cursor:pointer; font-weight:700; }
#xxt-save-bank-modal .xxt-save-bank-cancel { border:1px solid var(--xxt-border); background:transparent; color:var(--xxt-text-soft); }
#xxt-save-bank-modal .xxt-save-bank-confirm { border:0; background:var(--xxt-grad); color:#fff; }
#xxt-save-bank-modal .xxt-save-bank-confirm:disabled { cursor:not-allowed; opacity:.48; }
/* ===== 导出预览弹窗 ===== */
#xxt-preview-modal {
  position: fixed; inset: 0; z-index: 100005;
  background: rgba(15,23,42,0.42); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  opacity: 0; pointer-events: none; transition: opacity .28s ease;
}
#xxt-preview-modal.open { opacity: 1; pointer-events: auto; }
#xxt-preview-modal .xxt-preview-box {
  background: #fff; border: 1px solid var(--xxt-border); border-radius: 22px;
  width: min(920px, 94vw); max-height: 90vh; padding: 22px;
  box-shadow: var(--xxt-shadow); display:flex; flex-direction:column;
  color:var(--xxt-text); transform:translateY(16px) scale(.97);
  transition:transform .3s cubic-bezier(.16,1,.3,1);
}
#xxt-preview-modal.open .xxt-preview-box { transform:translateY(0) scale(1); }
#xxt-preview-modal .xxt-modal-header { display:flex; align-items:center; justify-content:space-between; padding-bottom:14px; margin-bottom:10px; border-bottom:1px solid var(--xxt-border); flex-shrink:0; }
#xxt-preview-modal .xxt-modal-header h3 { margin:0; font-size:16px; font-weight:800; color:var(--xxt-text); }
#xxt-preview-modal .xxt-modal-close { width:28px; height:28px; border:0; border-radius:50%; background:rgba(15,23,42,.05); color:#9ca3af; cursor:pointer; font-size:15px; }
#xxt-preview-modal .xxt-modal-close:hover { background:#ef4444; color:#fff; }
#xxt-preview-modal .xxt-preview-meta { color:var(--xxt-text-soft); font-size:12px; line-height:1.55; margin:0 0 10px; }
#xxt-preview-modal .xxt-preview-content { overflow:auto; min-height:180px; max-height:65vh; padding:4px 6px 10px 2px; }
#xxt-preview-modal .xxt-preview-content::-webkit-scrollbar { width:6px; }
#xxt-preview-modal .xxt-preview-content::-webkit-scrollbar-thumb { background:linear-gradient(180deg,#c4b5fd,#f0abfc); border-radius:6px; }
#xxt-preview-modal .xxt-preview-document { background:#fff; color:#111827; border:1px solid #e5e7eb; border-radius:12px; padding:24px 28px; font:14px/1.75 "Microsoft YaHei","PingFang SC",Arial,sans-serif; }
#xxt-preview-modal .xxt-preview-document h1 { margin:0 0 22px; text-align:center; font-size:22px; line-height:1.4; }
#xxt-preview-modal .xxt-preview-document h2 { margin:20px 0 10px; padding-bottom:4px; border-bottom:1px solid #d1d5db; font-size:16px; }
#xxt-preview-modal .xxt-preview-question { margin:0 0 16px; padding-bottom:12px; border-bottom:1px dashed #e5e7eb; break-inside:avoid; }
#xxt-preview-modal .xxt-preview-stem { font-size:14px; }
#xxt-preview-modal .xxt-preview-option { padding-left:24px; }
#xxt-preview-modal .xxt-preview-answer { margin-top:5px; padding:6px 9px; color:#047857; background:#ecfdf5; border-radius:7px; font-size:12px; }
#xxt-preview-modal .xxt-preview-wrong { margin-left:7px; padding:2px 6px; color:#b91c1c; background:#fee2e2; border-radius:5px; font-size:11px; font-weight:700; }
#xxt-preview-modal .xxt-preview-wrong-block { margin-top:18px; padding-top:12px; border-top:1px solid #9ca3af; }
#xxt-preview-modal .xxt-preview-wrong-item { margin:0 0 10px; padding:8px 10px; background:#fff7ed; border-left:3px solid #f97316; border-radius:6px; font-size:12px; }
#xxt-preview-modal .xxt-preview-code { margin:0; white-space:pre-wrap; word-break:break-word; background:#f8fafc; border:1px solid #e5e7eb; border-radius:10px; padding:16px; color:#1f2937; font:12px/1.7 ui-monospace,SFMono-Regular,Consolas,monospace; }
#xxt-preview-modal .xxt-preview-document img { display:block; max-width:100%; max-height:260px; height:auto; margin:6px 0; object-fit:contain; }
#xxt-preview-modal .xxt-preview-pager { display:flex; align-items:center; justify-content:center; gap:10px; padding-top:10px; color:var(--xxt-text-soft); font-size:11px; flex-shrink:0; }
#xxt-preview-modal .xxt-preview-pager button, #xxt-preview-modal .xxt-preview-download { border:1px solid var(--xxt-accent); border-radius:9px; padding:7px 12px; background:#fff; color:var(--xxt-accent-strong); cursor:pointer; font:700 12px/1.3 inherit; }
#xxt-preview-modal .xxt-preview-pager button:hover, #xxt-preview-modal .xxt-preview-download:hover { background:var(--xxt-grad); color:#fff; border-color:transparent; }
#xxt-preview-modal .xxt-preview-pager button:disabled { opacity:.45; cursor:not-allowed; }
#xxt-preview-modal .xxt-preview-actions { display:flex; justify-content:flex-end; gap:10px; padding-top:14px; margin-top:4px; border-top:1px solid var(--xxt-border); flex-shrink:0; }
#xxt-preview-modal .xxt-preview-cancel { border:1px solid var(--xxt-border); border-radius:10px; padding:9px 18px; background:transparent; color:var(--xxt-text-soft); cursor:pointer; font-weight:700; }
#xxt-preview-modal .xxt-preview-download { border:0; background:var(--xxt-grad); color:#fff; padding:9px 18px; }
/* ===== 在线查看/编辑弹窗 ===== */
#xxt-editor-modal {
  position: fixed; inset: 0; z-index: 100004;
  background: rgba(15,23,42,0.42); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  opacity: 0; pointer-events: none; transition: opacity 0.28s ease;
}
#xxt-editor-modal.open { opacity: 1; pointer-events: auto; }
#xxt-editor-modal .xxt-editor-box {
  background: #fff; border: 1px solid var(--xxt-border); border-radius: 22px;
  width: min(900px, 94vw); max-height: 90vh; padding: 22px;
  box-shadow: var(--xxt-shadow); display: flex; flex-direction: column;
  color: var(--xxt-text); transform: translateY(16px) scale(.97);
  transition: transform .3s cubic-bezier(.16,1,.3,1);
}
#xxt-editor-modal.open .xxt-editor-box { transform: translateY(0) scale(1); }
#xxt-editor-modal .xxt-modal-header { display:flex; align-items:center; justify-content:space-between; padding-bottom:14px; margin-bottom:12px; border-bottom:1px solid var(--xxt-border); flex-shrink:0; }
#xxt-editor-modal .xxt-modal-header h3 { margin:0; font-size:16px; font-weight:800; color:var(--xxt-text); }
#xxt-editor-modal .xxt-modal-close { width:28px; height:28px; border:0; border-radius:50%; background:rgba(15,23,42,.05); color:#9ca3af; cursor:pointer; font-size:15px; }
#xxt-editor-modal .xxt-modal-close:hover { background:#ef4444; color:#fff; }
#xxt-editor-modal .xxt-editor-note { color:#6b7280; font-size:12px; margin:0 0 12px; }
#xxt-editor-modal .xxt-editor-selection-toolbar { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin:0 0 12px; padding:10px 12px; border:1px solid var(--xxt-border); border-radius:12px; background:var(--xxt-grad-soft); }
#xxt-editor-modal .xxt-editor-selection-toolbar button { border:1px solid var(--xxt-accent); border-radius:8px; padding:6px 9px; background:#fff; color:var(--xxt-accent-strong); cursor:pointer; font:700 11px/1.3 inherit; }
#xxt-editor-modal .xxt-editor-selection-toolbar button:hover { background:var(--xxt-grad); color:#fff; border-color:transparent; }
#xxt-editor-modal .xxt-editor-selection-count { margin-left:auto; color:var(--xxt-text-soft); font-size:11px; font-weight:700; }
#xxt-editor-modal .xxt-editor-list { overflow-y:auto; padding:2px 5px 8px 0; }
#xxt-editor-modal .xxt-editor-list::-webkit-scrollbar { width:6px; }
#xxt-editor-modal .xxt-editor-list::-webkit-scrollbar-thumb { background:linear-gradient(180deg,#c4b5fd,#f0abfc); border-radius:6px; }
#xxt-editor-modal .xxt-editor-type { margin:14px 0 8px; color:var(--xxt-accent-strong); font-size:14px; font-weight:800; }
#xxt-editor-modal .xxt-editor-card { background:var(--xxt-surface-solid); border:1px solid var(--xxt-border); border-radius:15px; padding:14px; margin-bottom:12px; }
#xxt-editor-modal .xxt-editor-card.xxt-editor-unselected { opacity:.58; }
#xxt-editor-modal .xxt-editor-select { width:17px; height:17px; accent-color:var(--xxt-accent); cursor:pointer; flex:0 0 auto; }
#xxt-editor-modal .xxt-editor-label { display:block; color:var(--xxt-text-soft); font-size:12px; font-weight:700; margin:0 0 5px; }
#xxt-editor-modal textarea, #xxt-editor-modal input[type="text"] { box-sizing:border-box; width:100%; border:1px solid var(--xxt-border); border-radius:9px; padding:8px 10px; background:#fff; color:var(--xxt-text); font:13px/1.55 inherit; outline:0; resize:vertical; }
#xxt-editor-modal textarea:focus, #xxt-editor-modal input[type="text"]:focus { border-color:var(--xxt-accent); box-shadow:0 0 0 3px rgba(124,92,240,.14); }
#xxt-editor-modal .xxt-editor-stem { min-height:58px; }
#xxt-editor-modal .xxt-editor-answer { min-height:42px; }
#xxt-editor-modal .xxt-editor-option { display:grid; grid-template-columns:32px 1fr 30px; gap:7px; align-items:start; margin-top:7px; }
#xxt-editor-modal .xxt-editor-letter { padding:8px 0; font-weight:800; color:var(--xxt-accent); text-align:center; }
#xxt-editor-modal .xxt-editor-remove { border:0; background:transparent; color:#9ca3af; cursor:pointer; font-size:16px; padding:7px 0; }
#xxt-editor-modal .xxt-editor-remove:hover { color:#ef4444; }
#xxt-editor-modal .xxt-editor-add { margin-top:8px; border:1px dashed var(--xxt-accent); background:transparent; color:var(--xxt-accent-strong); border-radius:8px; padding:5px 10px; cursor:pointer; font-size:12px; }
#xxt-editor-modal .xxt-editor-actions { display:flex; justify-content:flex-end; gap:10px; padding-top:14px; margin-top:4px; border-top:1px solid var(--xxt-border); flex-shrink:0; }
#xxt-editor-modal .xxt-editor-actions button { border-radius:10px; padding:9px 20px; cursor:pointer; font-weight:700; }
#xxt-editor-modal .xxt-editor-save { border:0; background:var(--xxt-grad); color:#fff; }
#xxt-editor-modal .xxt-editor-cancel { border:1px solid var(--xxt-border); background:transparent; color:var(--xxt-text-soft); }

/* ===== 响应式微调 ===== */
@media screen and (max-height: 700px) {
  #xxt-panel { top: 40px; max-height: 92vh; }
  #xxt-panel .xxt-stat { gap: 4px; }
  #xxt-panel .xxt-stat-item { padding: 8px 2px 5px; }
  #xxt-panel .xxt-stat-item .xxt-num { font-size: 19px; }
}

/* ===== 主面板紧凑布局 =====
 * 提取完成后只保留最常用的结果、操作和批量进度；格式、答案和乱序
 * 收进可展开的“导出设置”，避免在课程页上遮住过多内容。
 */
#xxt-panel {
  width:min(360px, calc(100vw - 16px)); padding:14px 14px 13px;
  border-radius:18px; max-height:calc(100vh - 86px);
}
#xxt-panel .xxt-header { margin-bottom:10px; padding-bottom:9px; }
#xxt-panel .xxt-header h3 { font-size:14px; letter-spacing:0; }
#xxt-panel .xxt-feedback-link { height:24px; padding:0 7px; font-size:10px; }
#xxt-panel .xxt-settings-btn { width:25px; height:25px; margin-right:0; }
#xxt-panel .xxt-settings-btn svg { width:14px; height:14px; }

#xxt-panel .xxt-bank-entry { min-height:48px; margin:0 0 8px; padding:7px 9px; gap:8px; border-radius:12px; }
#xxt-panel .xxt-bank-entry-icon { width:31px; height:31px; flex-basis:31px; border-radius:9px; font-size:17px; }
#xxt-panel .xxt-bank-entry-copy strong { font-size:12.5px; }
#xxt-panel .xxt-bank-entry-copy small { font-size:10px; }
#xxt-panel .xxt-bank-entry-arrow { font-size:18px; }
#xxt-panel .xxt-tiku-promo { margin:0 0 8px; padding:7px 8px; border-radius:12px; }
#xxt-panel .xxt-tiku-promo-top { gap:7px; }
#xxt-panel .xxt-tiku-promo-icon { width:28px; height:28px; flex-basis:28px; border-radius:9px; font-size:15px; }
#xxt-panel .xxt-tiku-promo-copy strong { font-size:11.5px; }
#xxt-panel .xxt-tiku-promo-copy small { font-size:9.5px; }
#xxt-panel .xxt-tiku-promo-actions { gap:5px; margin-top:6px; }
#xxt-panel .xxt-tiku-promo-link { min-height:24px; padding:0 6px; border-radius:8px; font-size:9.5px; }

#xxt-panel .xxt-primary-actions { display:grid; grid-template-columns:1fr 1fr; gap:7px; margin-bottom:8px; }
#xxt-panel .xxt-primary-actions .xxt-btn-extract,
#xxt-panel .xxt-primary-actions .xxt-btn-batch { min-height:39px; margin:0; padding:8px 7px; border-radius:11px; font-size:12px; line-height:1.25; letter-spacing:0; }
#xxt-panel .xxt-primary-actions .xxt-btn-batch { border-style:solid; font-weight:800; }

#xxt-panel .xxt-batch-live { margin:0 0 8px; padding:9px 10px; border-radius:12px; }
#xxt-panel .xxt-batch-live-title { font-size:11.5px; }
#xxt-panel .xxt-batch-live-state { padding:2px 6px; font-size:10px; }
#xxt-panel .xxt-batch-live-current { margin-top:5px; font-size:11.5px; }
#xxt-panel .xxt-batch-live-detail { margin-top:2px; font-size:10px; }
#xxt-panel .xxt-batch-live-bar { height:5px; margin:7px 0 8px; }
#xxt-panel .xxt-batch-live-actions { gap:6px; }
#xxt-panel .xxt-batch-live-actions button { padding:6px 7px; font-size:10.5px; }
#xxt-panel .xxt-batch-live-log { margin-top:7px; padding-top:6px; }
#xxt-panel .xxt-batch-live-log-list { max-height:96px; }

#xxt-panel .xxt-status { margin-bottom:8px; padding:7px 9px; font-size:11px; }
#xxt-panel .xxt-stat { gap:6px; margin:8px 0 9px; }
#xxt-panel .xxt-stat-item { padding:7px 3px 6px; border-radius:10px; }
#xxt-panel .xxt-stat-item .xxt-num { font-size:18px; }
#xxt-panel .xxt-stat-item .xxt-label { margin-top:1px; font-size:10px; }
#xxt-panel .xxt-result-actions { margin-bottom:8px !important; }
#xxt-panel .xxt-result-actions .xxt-btn { padding:8px 6px !important; border-radius:10px !important; font-size:11px !important; }
#xxt-panel .xxt-selection-summary { margin:0 0 8px; padding:6px 8px; border-radius:9px; font-size:10.5px; }

#xxt-panel .xxt-export-settings { margin-top:0; border:1px solid var(--xxt-border); border-radius:11px; background:var(--xxt-surface-solid); overflow:hidden; }
#xxt-panel .xxt-export-settings summary { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:9px 10px; cursor:pointer; color:var(--xxt-accent-strong); font-size:11px; font-weight:800; list-style:none; user-select:none; }
#xxt-panel .xxt-export-settings summary::-webkit-details-marker { display:none; }
#xxt-panel .xxt-export-settings summary::before { content:'›'; margin-right:5px; font-size:15px; line-height:0; transition:transform .18s ease; }
#xxt-panel .xxt-export-settings[open] summary::before { transform:rotate(90deg); }
#xxt-panel .xxt-export-settings summary small { margin-left:auto; color:var(--xxt-text-soft); font-size:10px; font-weight:600; }
#xxt-panel .xxt-export-settings-body { padding:0 9px 9px; border-top:1px solid var(--xxt-border); }
#xxt-panel .xxt-export-settings .xxt-section { margin-top:8px; padding:8px 9px; border-radius:10px; box-shadow:none; }
#xxt-panel .xxt-export-settings .xxt-filename { padding:8px 9px; font-size:11px; }
#xxt-panel .xxt-export-settings .xxt-format-row { gap:5px; margin-top:7px; font-size:10.5px; }
#xxt-panel .xxt-export-settings .xxt-format-row label { gap:3px; padding:4px 7px; border-radius:12px; font-size:10px; }
#xxt-panel .xxt-export-settings .xxt-format-row input[type="radio"] { width:12px; height:12px; }
#xxt-panel .xxt-export-settings .xxt-toggle { gap:7px; margin-top:6px; padding:7px 8px; border-radius:9px; }
#xxt-panel .xxt-export-settings .xxt-toggle .xxt-checkbox-wrap { width:16px; height:16px; border-radius:5px; }
#xxt-panel .xxt-export-settings .xxt-toggle span { font-size:11px; line-height:1.35; }
#xxt-panel .xxt-actions { grid-template-columns:repeat(3, 1fr); gap:6px; margin-top:8px; }
#xxt-panel .xxt-actions .xxt-btn { padding:8px 4px; border-radius:10px; font-size:10.5px; }
#xxt-panel .xxt-wrong-hint { margin-top:6px; padding:7px 8px; font-size:10.5px; }
  `;
  // document-start 时 document.head 在少数页面还未创建，优先挂到根节点，
  // 避免样式注入异常导致整段脚本中断。
  function appendUserscriptStyle(styleElement) {
    const target = document.head || document.documentElement;
    if (target) target.appendChild(styleElement);
    else document.addEventListener('DOMContentLoaded', () => {
      (document.head || document.documentElement).appendChild(styleElement);
    }, { once: true });
  }

  const style = document.createElement('style');
  style.textContent = css;
  appendUserscriptStyle(style);

  // ==================== 暗色模式 CSS ====================
  const darkCSS = `
[data-xxt-theme="dark"] #xxt-panel {
  --xxt-surface: #1e1e2e;
  --xxt-surface-solid: #181825;
  --xxt-border: #313244;
  --xxt-shadow: 0 20px 48px -12px rgba(0,0,0,0.55), 0 8px 18px -8px rgba(0,0,0,0.4);
  --xxt-text: #f5f7fb;
  --xxt-text-soft: #b8c0d8;
  color: var(--xxt-text);
  background: #1e1e2e;
}
[data-xxt-theme="dark"] #xxt-panel::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, #7c3aed, #db2777);
}
[data-xxt-theme="dark"] #xxt-panel .xxt-header {
  border-bottom-color: rgba(205,214,244,0.10);
}
[data-xxt-theme="dark"] #xxt-panel .xxt-header h3 {
  -webkit-text-fill-color: #cdd6f4; color: #cdd6f4;
  background: none;
}
[data-xxt-theme="dark"] #xxt-panel .xxt-bank-entry {
  background: linear-gradient(135deg, rgba(124,58,237,0.18), rgba(219,39,119,0.13));
  border-color: rgba(196,181,253,0.26); color: #f5f7fb;
}
[data-xxt-theme="dark"] #xxt-panel .xxt-bank-entry:hover { border-color: rgba(196,181,253,0.58); }
[data-xxt-theme="dark"] #xxt-panel .xxt-bank-entry-icon { background: #181825; }
[data-xxt-theme="dark"] #xxt-panel .xxt-bank-entry-copy strong { color: #e9d5ff; }
[data-xxt-theme="dark"] #xxt-panel .xxt-bank-entry-copy small { color: #a6adc8; }
[data-xxt-theme="dark"] #xxt-panel .xxt-bank-entry-arrow { color: #c4b5fd; }
[data-xxt-theme="dark"] #xxt-panel .xxt-tiku-promo { background:linear-gradient(135deg, rgba(14,116,144,.22), rgba(5,150,105,.16)); border-color:rgba(125,211,252,.30); }
[data-xxt-theme="dark"] #xxt-panel .xxt-tiku-promo-icon { background:#181825; color:#7dd3fc; }
[data-xxt-theme="dark"] #xxt-panel .xxt-tiku-promo-copy strong { color:#bae6fd; }
[data-xxt-theme="dark"] #xxt-panel .xxt-tiku-promo-copy small { color:#a6c6d8; }
[data-xxt-theme="dark"] #xxt-panel .xxt-tiku-promo-link { color:#bae6fd; background:rgba(24,24,37,.74); border-color:rgba(125,211,252,.48); }
[data-xxt-theme="dark"] #xxt-panel .xxt-tiku-promo-link:hover { background:#0284c7; border-color:#0284c7; color:#fff; }
[data-xxt-theme="dark"] #xxt-panel .xxt-btn-batch { background:rgba(124,58,237,.10); border-color:rgba(196,181,253,.54); color:#ddd6fe; }
[data-xxt-theme="dark"] #xxt-panel .xxt-batch-live { border-color:rgba(196,181,253,.40); background:rgba(124,58,237,.12); }
[data-xxt-theme="dark"] #xxt-panel .xxt-batch-live-title { color:#f5f3ff; }
[data-xxt-theme="dark"] #xxt-panel .xxt-batch-live-current { color:#ddd6fe; }
[data-xxt-theme="dark"] #xxt-panel .xxt-batch-live-detail { color:#bac6dd; }
[data-xxt-theme="dark"] #xxt-panel .xxt-batch-live-actions button { background:#181825; color:#ddd6fe; border-color:#a78bfa; }
[data-xxt-theme="dark"] #xxt-batch-modal .xxt-batch-box { background:#1e1e2e; --xxt-surface-solid:#181825; --xxt-border:#313244; --xxt-text:#f5f7fb; --xxt-text-soft:#b8c0d8; }
[data-xxt-theme="dark"] #xxt-batch-modal .xxt-modal-header { border-bottom-color:rgba(205,214,244,.10); }
[data-xxt-theme="dark"] #xxt-batch-modal .xxt-modal-close { background:rgba(205,214,244,.08); color:#a6adc8; }
[data-xxt-theme="dark"] #xxt-batch-modal .xxt-batch-toolbar button, [data-xxt-theme="dark"] #xxt-batch-modal .xxt-batch-actions button { background:#181825; color:#c4b5fd; border-color:#a78bfa; }
[data-xxt-theme="dark"] #xxt-batch-modal .xxt-batch-item { background:#181825; border-color:#313244; }
[data-xxt-theme="dark"] #xxt-batch-modal .xxt-batch-item-title { color:#f5f7fb; }
[data-xxt-theme="dark"] #xxt-panel .xxt-btn-extract {
  background: var(--xxt-grad); color: #fff;
  box-shadow: 0 10px 22px -8px rgba(168,85,247,0.6);
}
[data-xxt-theme="dark"] #xxt-panel .xxt-btn-extract:hover {
  box-shadow: 0 16px 30px -8px rgba(168,85,247,0.8);
}
[data-xxt-theme="dark"] #xxt-panel .xxt-btn-extract:disabled { background: #45475a; }
[data-xxt-theme="dark"] .xxt-status-ok { color: #4ade80; background: rgba(16,185,129,0.14); border-color: rgba(16,185,129,0.3); }
[data-xxt-theme="dark"] .xxt-status-loading { color: #93c5fd; background: rgba(59,130,246,0.14); border-color: rgba(96,165,250,0.3); }
[data-xxt-theme="dark"] .xxt-status-err { color: #f87171; background: rgba(239,68,68,0.14); border-color: rgba(239,68,68,0.3); }
[data-xxt-theme="dark"] .xxt-status-warn { color: #fbbf24; background: rgba(245,158,11,0.14); border-color: rgba(245,158,11,0.3); }
[data-xxt-theme="dark"] #xxt-panel .xxt-stat-item {
  background: #181825; border-color: rgba(205,214,244,0.10);
  box-shadow: 0 4px 12px -6px rgba(0,0,0,0.4);
}
[data-xxt-theme="dark"] #xxt-panel .xxt-stat-item:hover { border-color: #a78bfa; }
[data-xxt-theme="dark"] #xxt-panel .xxt-stat-item .xxt-num {
  -webkit-text-fill-color: #c4b5fd; color: #c4b5fd; background: none;
}
[data-xxt-theme="dark"] #xxt-panel .xxt-stat-item .xxt-label { color: #a6adc8; }
[data-xxt-theme="dark"] #xxt-panel .xxt-section {
  background: #181825; border-color: rgba(205,214,244,0.10);
}
[data-xxt-theme="dark"] #xxt-panel .xxt-filename {
  border-color: rgba(205,214,244,0.14); color: #cdd6f4; background: #11111b;
}
[data-xxt-theme="dark"] #xxt-panel .xxt-filename:focus {
  border-color: #a78bfa;
  box-shadow: 0 0 0 4px rgba(167,139,250,0.18);
}
[data-xxt-theme="dark"] #xxt-panel .xxt-format-row { color: #a6adc8; }
[data-xxt-theme="dark"] #xxt-panel .xxt-format-row label {
  border-color: rgba(205,214,244,0.14); background: #181825; color: #cdd6f4;
}
[data-xxt-theme="dark"] #xxt-panel .xxt-format-row label:hover { border-color: rgba(167,139,250,0.5); }
[data-xxt-theme="dark"] #xxt-panel .xxt-format-row label:has(input:checked) {
  color: #fff; border-color: transparent; background: var(--xxt-grad);
}
[data-xxt-theme="dark"] .xxt-btn-outline {
  background: #181825; color: #c4b5fd; border-color: #a78bfa !important;
}
[data-xxt-theme="dark"] .xxt-btn-outline:hover {
  background: var(--xxt-grad); color: #fff; border-color: transparent !important;
}
[data-xxt-theme="dark"] #xxt-panel .xxt-toggle {
  background: #181825; border-color: rgba(205,214,244,0.10);
}
[data-xxt-theme="dark"] #xxt-panel .xxt-toggle:hover { border-color: rgba(167,139,250,0.5); }
[data-xxt-theme="dark"] #xxt-panel .xxt-toggle .xxt-checkbox-wrap {
  border-color: #585b70; background: #11111b;
}
[data-xxt-theme="dark"] #xxt-panel .xxt-toggle span { color: #cdd6f4; }
[data-xxt-theme="dark"] #xxt-panel .xxt-selection-summary { background:rgba(205,214,244,.08); color:#a6adc8; }
[data-xxt-theme="dark"] #xxt-panel .xxt-selection-summary.xxt-selection-limited { background:rgba(167,139,250,.16); color:#ddd6fe; }
[data-xxt-theme="dark"] #xxt-panel .xxt-wrong-hint {
  color: #f87171; background: rgba(239,68,68,0.14); border-color: rgba(239,68,68,0.3);
}
/* ===== 设置弹窗暗色 ===== */
[data-xxt-theme="dark"] #xxt-panel .xxt-settings-btn { color: #a6adc8; }
[data-xxt-theme="dark"] #xxt-panel .xxt-settings-btn:hover { background: rgba(167,139,250,0.18); color: #c4b5fd; }
[data-xxt-theme="dark"] #xxt-settings-modal .xxt-modal-box {
  --xxt-surface-solid: #1e1e2e;
  --xxt-border: #313244;
  --xxt-shadow: 0 20px 48px -12px rgba(0,0,0,0.6);
  background: #1e1e2e;
}
[data-xxt-theme="dark"] #xxt-settings-modal .xxt-modal-header { border-bottom-color: rgba(205,214,244,0.10); }
[data-xxt-theme="dark"] #xxt-settings-modal .xxt-modal-header h3 {
  -webkit-text-fill-color: #cdd6f4; color: #cdd6f4; background: none;
}
[data-xxt-theme="dark"] #xxt-settings-modal .xxt-modal-close {
  background: rgba(205,214,244,0.08); color: #a6adc8;
}
[data-xxt-theme="dark"] #xxt-settings-modal .xxt-modal-close:hover { background: #ef4444; color: #fff; }
[data-xxt-theme="dark"] #xxt-settings-modal .xxt-setting-row {
  background: #181825; border-color: #313244; color: #f5f7fb;
}
[data-xxt-theme="dark"] #xxt-settings-modal .xxt-theme-btn {
  background: #313244; color: #a6adc8; border-color: #45475a;
}
[data-xxt-theme="dark"] #xxt-settings-modal .xxt-theme-btn:hover { border-color: #585b70; color: #cdd6f4; }
[data-xxt-theme="dark"] #xxt-settings-modal .xxt-theme-btn.active {
  background: var(--xxt-grad); color: #fff; border-color: transparent;
}
[data-xxt-theme="dark"] #xxt-settings-modal .xxt-shortcut-display {
  background: rgba(167,139,250,0.12); border-color: rgba(167,139,250,0.25); color: #cdd6f4;
}
[data-xxt-theme="dark"] #xxt-settings-modal .xxt-shortcut-keys {
  color: #c4b5fd; background: rgba(167,139,250,0.18);
}

/* ===== 历史记录弹窗暗色 ===== */
[data-xxt-theme="dark"] #xxt-history-modal .xxt-modal-box {
  --xxt-surface-solid: #1e1e2e;
  --xxt-border: #313244;
  --xxt-shadow: 0 20px 48px -12px rgba(0,0,0,0.6);
  background: #1e1e2e;
}
[data-xxt-theme="dark"] #xxt-history-modal .xxt-modal-header { border-bottom-color: rgba(205,214,244,0.10); }
[data-xxt-theme="dark"] #xxt-history-modal .xxt-modal-header h3 {
  -webkit-text-fill-color: #cdd6f4; color: #cdd6f4; background: none;
}
[data-xxt-theme="dark"] #xxt-history-modal .xxt-modal-close {
  background: rgba(205,214,244,0.08); color: #a6adc8;
}
[data-xxt-theme="dark"] #xxt-history-modal .xxt-modal-close:hover { background: #ef4444; color: #fff; }
[data-xxt-theme="dark"] #xxt-history-modal .xxt-history-empty { color: #585b70; }
[data-xxt-theme="dark"] #xxt-history-modal .xxt-history-item {
  background: #181825; border-color: rgba(205,214,244,0.10);
}
[data-xxt-theme="dark"] #xxt-history-modal .xxt-history-item:hover { border-color: rgba(167,139,250,0.5); }
[data-xxt-theme="dark"] #xxt-history-modal .xxt-history-title { color: #cdd6f4; }
[data-xxt-theme="dark"] #xxt-history-modal .xxt-history-meta { color: #a6adc8; }
[data-xxt-theme="dark"] #xxt-history-modal .xxt-history-delete { color: #585b70; }
[data-xxt-theme="dark"] #xxt-history-modal .xxt-history-delete:hover { background: rgba(239,68,68,0.18); color: #f87171; }
[data-xxt-theme="dark"] #xxt-history-modal .xxt-history-download { color: #585b70; }
[data-xxt-theme="dark"] #xxt-history-modal .xxt-history-download:hover { background: rgba(167,139,250,0.18); color: #c4b5fd; }
[data-xxt-theme="dark"] #xxt-bank-modal .xxt-bank-box { background:#1e1e2e; --xxt-surface-solid:#181825; --xxt-border:#313244; --xxt-text:#f5f7fb; --xxt-text-soft:#b8c0d8; }
[data-xxt-theme="dark"] #xxt-bank-modal .xxt-modal-header { border-bottom-color:rgba(205,214,244,.10); }
[data-xxt-theme="dark"] #xxt-bank-modal .xxt-modal-close { background:rgba(205,214,244,.08); color:#a6adc8; }
[data-xxt-theme="dark"] #xxt-bank-modal select, [data-xxt-theme="dark"] #xxt-bank-modal input { background:#11111b; color:#cdd6f4; border-color:#45475a; }
[data-xxt-theme="dark"] #xxt-bank-modal .xxt-bank-btn { background:#181825; color:#c4b5fd; border-color:#a78bfa; }
[data-xxt-theme="dark"] #xxt-bank-modal .xxt-bank-card { background:#181825; border-color:rgba(205,214,244,.10); }
[data-xxt-theme="dark"] #xxt-bank-modal .xxt-bank-type-head { border-bottom-color:rgba(205,214,244,.14); }
[data-xxt-theme="dark"] #xxt-bank-modal .xxt-bank-type-title, [data-xxt-theme="dark"] #xxt-bank-modal .xxt-bank-card-number, [data-xxt-theme="dark"] #xxt-bank-modal .xxt-bank-option-letter { color:#ddd6fe; }
[data-xxt-theme="dark"] #xxt-bank-modal .xxt-bank-card-number { background:rgba(124,58,237,.20); }
[data-xxt-theme="dark"] #xxt-bank-modal .xxt-bank-options { background:rgba(124,58,237,.12); }
[data-xxt-theme="dark"] #xxt-bank-modal .xxt-bank-answer { color:#a7f3d0; border-color:rgba(52,211,153,.32); background:rgba(16,185,129,.13); }
[data-xxt-theme="dark"] #xxt-bank-modal .xxt-bank-card-actions button { color:#a6adc8; border-color:#45475a; }
[data-xxt-theme="dark"] #xxt-bank-modal .xxt-bank-pagination button { color:#a6adc8; border-color:#45475a; }
[data-xxt-theme="dark"] #xxt-save-bank-modal .xxt-save-bank-box { background:#1e1e2e; --xxt-surface-solid:#181825; --xxt-border:#313244; --xxt-text:#f5f7fb; --xxt-text-soft:#b8c0d8; }
[data-xxt-theme="dark"] #xxt-save-bank-modal .xxt-modal-header, [data-xxt-theme="dark"] #xxt-save-bank-modal .xxt-save-bank-actions { border-color:rgba(205,214,244,.10); }
[data-xxt-theme="dark"] #xxt-save-bank-modal .xxt-modal-close { background:rgba(205,214,244,.08); color:#a6adc8; }
[data-xxt-theme="dark"] #xxt-save-bank-modal select, [data-xxt-theme="dark"] #xxt-save-bank-modal input { background:#11111b; color:#cdd6f4; border-color:#45475a; }
[data-xxt-theme="dark"] #xxt-save-bank-modal .xxt-save-bank-mode button, [data-xxt-theme="dark"] #xxt-save-bank-modal .xxt-save-bank-cancel { background:#181825; color:#cdd6f4; border-color:#45475a; }
[data-xxt-theme="dark"] #xxt-save-bank-modal .xxt-save-bank-mode button.active { background:var(--xxt-grad); color:#fff; border-color:transparent; }
[data-xxt-theme="dark"] #xxt-editor-modal .xxt-editor-box { background:#1e1e2e; --xxt-surface-solid:#181825; --xxt-border:#313244; --xxt-text:#f5f7fb; --xxt-text-soft:#b8c0d8; }
[data-xxt-theme="dark"] #xxt-editor-modal .xxt-modal-header { border-bottom-color:rgba(205,214,244,.10); }
[data-xxt-theme="dark"] #xxt-editor-modal .xxt-modal-close { background:rgba(205,214,244,.08); color:#a6adc8; }
[data-xxt-theme="dark"] #xxt-editor-modal .xxt-editor-note { color:#a6adc8; }
[data-xxt-theme="dark"] #xxt-editor-modal .xxt-editor-selection-toolbar { border-color:#313244; background:rgba(124,58,237,.14); }
[data-xxt-theme="dark"] #xxt-editor-modal .xxt-editor-selection-toolbar button { background:#181825; color:#c4b5fd; border-color:#a78bfa; }
[data-xxt-theme="dark"] #xxt-editor-modal .xxt-editor-type { color:#c4b5fd; }
[data-xxt-theme="dark"] #xxt-editor-modal .xxt-editor-card { background:#181825; border-color:#313244; }
[data-xxt-theme="dark"] #xxt-editor-modal textarea, [data-xxt-theme="dark"] #xxt-editor-modal input[type="text"] { background:#11111b; color:#cdd6f4; border-color:#45475a; }
[data-xxt-theme="dark"] #xxt-editor-modal .xxt-editor-cancel { color:#cdd6f4; border-color:#45475a; }
[data-xxt-theme="dark"] #xxt-preview-modal .xxt-preview-box { background:#1e1e2e; --xxt-surface-solid:#181825; --xxt-border:#313244; --xxt-text:#f5f7fb; --xxt-text-soft:#b8c0d8; }
[data-xxt-theme="dark"] #xxt-preview-modal .xxt-modal-header { border-bottom-color:rgba(205,214,244,.10); }
[data-xxt-theme="dark"] #xxt-preview-modal .xxt-modal-close { background:rgba(205,214,244,.08); color:#a6adc8; }
[data-xxt-theme="dark"] #xxt-preview-modal .xxt-preview-document { background:#181825; color:#f5f7fb; border-color:#313244; }
[data-xxt-theme="dark"] #xxt-preview-modal .xxt-preview-document h2 { border-bottom-color:#45475a; }
[data-xxt-theme="dark"] #xxt-preview-modal .xxt-preview-question { border-bottom-color:#313244; }
[data-xxt-theme="dark"] #xxt-preview-modal .xxt-preview-answer { color:#6ee7b7; background:rgba(16,185,129,.14); }
[data-xxt-theme="dark"] #xxt-preview-modal .xxt-preview-wrong { color:#fca5a5; background:rgba(239,68,68,.18); }
[data-xxt-theme="dark"] #xxt-preview-modal .xxt-preview-wrong-item { background:rgba(249,115,22,.13); border-left-color:#fb923c; }
[data-xxt-theme="dark"] #xxt-preview-modal .xxt-preview-code { background:#11111b; border-color:#313244; color:#cdd6f4; }
[data-xxt-theme="dark"] #xxt-preview-modal .xxt-preview-pager button, [data-xxt-theme="dark"] #xxt-preview-modal .xxt-preview-cancel { background:#181825; color:#cdd6f4; border-color:#45475a; }
  `;
  const darkStyle = document.createElement('style');
  darkStyle.textContent = darkCSS;
  appendUserscriptStyle(darkStyle);

  // ==================== 设置存储 ====================
  const SETTINGS_KEY = 'xxt_settings';
  const DEFAULT_SETTINGS = {
    theme: 'auto',           // 'auto' | 'light' | 'dark'
    shortcut: {
      ctrl: true, shift: true, alt: false, key: 'e'
    },
    exportConfig: {          // 上一次的导出设置
      format: 'word',        // 'word' | 'pdf' | 'txt' | 'md'
      withAnswers: false,
      shuffle: false,
      bankImport: false
    },
    enableDrag: true,          // 所有脚本浮窗拖拽，默认开启
    rememberPanelPosition: true, // 记住所有窗口位置，默认开启
    panelPosition: null,        // 记住的面板位置 { left, top }
    floatingPositions: {},      // 各浮窗位置 { panel: { left, top }, ... }
    bankThreshold: 90           // 题库对比阈值（50-100）
  };

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        return {
          theme: saved.theme || DEFAULT_SETTINGS.theme,
          shortcut: { ...DEFAULT_SETTINGS.shortcut, ...(saved.shortcut || {}) },
          exportConfig: { ...DEFAULT_SETTINGS.exportConfig, ...(saved.exportConfig || {}) },
          // 旧版本只支持主面板拖拽且默认关闭；升级后默认开启全部浮窗拖拽。
          enableDrag: saved.allUiDragInitialized ? saved.enableDrag !== false : DEFAULT_SETTINGS.enableDrag,
          rememberPanelPosition: saved.rememberPanelPosition !== undefined ? saved.rememberPanelPosition : DEFAULT_SETTINGS.rememberPanelPosition,
          panelPosition: saved.panelPosition || null,
          floatingPositions: saved.floatingPositions && typeof saved.floatingPositions === 'object' ? saved.floatingPositions : {},
          allUiDragInitialized: true,
          bankThreshold: Math.max(50, Math.min(100, Number(saved.bankThreshold) || DEFAULT_SETTINGS.bankThreshold))
        };
      }
    } catch (e) { /* ignore */ }
    return {
      ...DEFAULT_SETTINGS,
      shortcut: { ...DEFAULT_SETTINGS.shortcut },
      exportConfig: { ...DEFAULT_SETTINGS.exportConfig },
      enableDrag: DEFAULT_SETTINGS.enableDrag,
      rememberPanelPosition: DEFAULT_SETTINGS.rememberPanelPosition,
      panelPosition: null,
      floatingPositions: {},
      allUiDragInitialized: true,
      bankThreshold: DEFAULT_SETTINGS.bankThreshold
    };
  }

  function saveSettings(settings) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) { /* ignore */ }
  }

  // 保存导出配置（格式、附加答案、打乱、题库导入）
  function saveExportConfig(els) {
    currentSettings.exportConfig = {
      format: getFormat(els),
      withAnswers: els.chkAnswers ? els.chkAnswers.checked : false,
      shuffle: els.chkShuffle ? els.chkShuffle.checked : false,
      bankImport: els.chkBankImport ? els.chkBankImport.checked : false
    };
    saveSettings(currentSettings);
  }

  let currentSettings = loadSettings();

  // 统一的浮窗拖动器：主面板、右侧进度卡和所有弹窗共用，避免每个组件各写一套
  // 鼠标事件。拖到边缘时会保留至少一小段可见区域，位置按设置保存。
  const xxtDraggableNodes = new WeakSet();
  function getXxtFloatingPosition(key) {
    const positions = currentSettings.floatingPositions || {};
    if (positions[key] && Number.isFinite(positions[key].left) && Number.isFinite(positions[key].top)) return positions[key];
    if (key === 'panel' && currentSettings.panelPosition &&
        Number.isFinite(currentSettings.panelPosition.left) && Number.isFinite(currentSettings.panelPosition.top)) {
      return currentSettings.panelPosition;
    }
    return null;
  }

  function applyXxtFloatingPosition(element, position) {
    if (!element || !position) return;
    const rect = element.getBoundingClientRect();
    // 浏览器窗口尺寸变化后，旧的坐标可能把浮窗完全带出屏幕。
    // 恢复位置时先限制到可见范围，保证标题栏始终够得到。
    const width = rect.width || 0;
    const height = rect.height || 96;
    const maxLeft = Math.max(8, window.innerWidth - width - 8);
    const maxTop = Math.max(8, window.innerHeight - Math.min(height, Math.max(96, window.innerHeight - 16)) - 8);
    element.style.position = 'fixed';
    element.style.left = `${Math.max(8, Math.min(maxLeft, Number(position.left) || 8))}px`;
    element.style.top = `${Math.max(8, Math.min(maxTop, Number(position.top) || 8))}px`;
    element.style.right = 'auto';
    element.style.bottom = 'auto';
    // 弹窗原本通过 transform 做居中/入场动画；拖动后由 left/top 接管位置。
    element.style.transform = 'none';
  }

  function enableXxtDragging(element, handle, key) {
    if (!element || !handle || xxtDraggableNodes.has(element)) return;
    xxtDraggableNodes.add(element);
    element.classList.add('xxt-draggable');
    const savedPosition = getXxtFloatingPosition(key);
    if (savedPosition) applyXxtFloatingPosition(element, savedPosition);

    let drag = null;
    const isInteractive = target => target !== handle && !!(target && target.closest && target.closest('button, a, input, select, textarea, label, [contenteditable="true"], [data-no-drag]'));
    const finish = event => {
      if (!drag) return;
      const moved = drag.moved;
      drag = null;
      element.classList.remove('xxt-dragging');
      element.style.transition = '';
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', finish, true);
      document.removeEventListener('pointercancel', finish, true);
      if (!moved || !currentSettings.rememberPanelPosition) return;
      const position = { left: parseFloat(element.style.left), top: parseFloat(element.style.top) };
      currentSettings.floatingPositions = { ...(currentSettings.floatingPositions || {}), [key]: position };
      if (key === 'panel') currentSettings.panelPosition = position;
      saveSettings(currentSettings);
      // 拖动标题栏后不应触发弹窗关闭等 click 行为。
      if (event) {
        const cancelClick = clickEvent => { clickEvent.preventDefault(); clickEvent.stopPropagation(); document.removeEventListener('click', cancelClick, true); };
        document.addEventListener('click', cancelClick, true);
      }
    };
    const move = event => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (!drag.moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
      drag.moved = true;
      const maxLeft = Math.max(8, window.innerWidth - drag.width - 8);
      const maxTop = Math.max(8, window.innerHeight - Math.min(drag.height, 96) - 8);
      element.style.left = `${Math.max(8, Math.min(maxLeft, drag.left + dx))}px`;
      element.style.top = `${Math.max(8, Math.min(maxTop, drag.top + dy))}px`;
      if (handle !== element) event.preventDefault();
    };
    handle.addEventListener('pointerdown', event => {
      // 主面板始终允许拖动；“所有浮窗可拖拽”设置只影响其余弹窗。
      if ((!currentSettings.enableDrag && key !== 'panel') || event.button !== 0 || isInteractive(event.target)) return;
      const rect = element.getBoundingClientRect();
      applyXxtFloatingPosition(element, { left: rect.left, top: rect.top });
      drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, left: rect.left, top: rect.top, width: rect.width, height: rect.height, moved: false };
      element.classList.add('xxt-dragging');
      element.style.transition = 'none';
      document.addEventListener('pointermove', move, true);
      document.addEventListener('pointerup', finish, true);
      document.addEventListener('pointercancel', finish, true);
      event.preventDefault();
    });
  }

  // ==================== 主题切换 ====================
  function applyTheme(theme) {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.setAttribute('data-xxt-theme', 'dark');
    } else if (theme === 'light') {
      root.removeAttribute('data-xxt-theme');
    } else {
      // auto: 跟随系统
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        root.setAttribute('data-xxt-theme', 'dark');
      } else {
        root.removeAttribute('data-xxt-theme');
      }
    }
  }

  applyTheme(currentSettings.theme);

  // 监听系统主题变化（仅在 auto 模式下生效）
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (currentSettings.theme === 'auto') {
      applyTheme('auto');
    }
  });

  // ==================== 历史记录 ====================
  const HISTORY_KEY = 'xxt_history';
  const MAX_HISTORY = 10;

  function loadHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function saveHistory(history) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch (e) { /* ignore */ }
  }

  function addToHistory(extractedData, fmt, withAnswers, withWrong, shuffle, bankImport, outputText) {
    const history = loadHistory();
    let totalQ = 0;
    for (const qtype of extractedData.typeOrder) {
      totalQ += (extractedData.results[qtype] || []).length;
    }
    const entry = {
      id: Date.now(),
      title: extractedData.title || '未命名',
      date: new Date().toLocaleString('zh-CN'),
      format: fmt,
      withAnswers: withAnswers,
      withWrong: withWrong,
      shuffle: shuffle,
      bankImport: bankImport || false,
      totalQuestions: totalQ,
      typeOrder: extractedData.typeOrder,
      results: extractedData.results,
      wrongCount: extractedData.wrongCount,
      hasMyAnswer: extractedData.hasMyAnswer,
      hasCorrectAnswer: extractedData.hasCorrectAnswer || false,
      outputText: outputText || ''
    };
    // 去重：相同标题+相同格式的旧记录替换
    const filtered = history.filter(h => !(h.title === entry.title && h.format === entry.format));
    filtered.unshift(entry);
    if (filtered.length > MAX_HISTORY) filtered.length = MAX_HISTORY;
    saveHistory(filtered);
    return filtered;
  }

  function deleteHistoryById(id) {
    const history = loadHistory().filter(h => h.id !== id);
    saveHistory(history);
    return history;
  }

  // ==================== 独立题库区 ====================
  // 题库与“下载历史”完全分离。优先使用 ScriptCat/Tampermonkey 的 GM 存储，
  // 这样在 chaoxing.com、edu.cn 等不同页面来源之间也能共享；未提供 GM 存储时
  // 回退到 localStorage，并在导入/导出中提供可靠的跨域迁移方式。
  const QUESTION_BANK_KEY = 'xxt_question_banks_v1';
  const QUESTION_BANK_TYPES = ['单选', '多选', '填空', '判断', '简答'];
  const QUESTION_BANK_MAX_BYTES = 8 * 1024 * 1024;
  let questionBankStateCache = null;
  // 其他标签页修改题库后，当前页下次打开题库会重新读取外部存储。
  window.addEventListener('storage', event => {
    if (event.key === QUESTION_BANK_KEY) questionBankStateCache = null;
  });
  // 题库 API 是同步链路；如果管理器暴露 Promise 版 GM API，就固定回退到
  // localStorage，避免“本次写入落到 localStorage、下次读取却拿到旧 GM 值”。
  let gmStorageIsSync = null;

  function readQuestionBankValue() {
    try {
      if (typeof GM_getValue === 'function' && gmStorageIsSync !== false) {
        const value = GM_getValue(QUESTION_BANK_KEY, '');
        if (!value || typeof value.then !== 'function') {
          gmStorageIsSync = true;
          if (value) return value;
        } else {
          gmStorageIsSync = false;
        }
      }
    } catch (e) { gmStorageIsSync = false; }
    try { return localStorage.getItem(QUESTION_BANK_KEY) || ''; } catch (e) { return ''; }
  }

  function writeQuestionBankValue(value) {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    const serializedBytes = typeof TextEncoder === 'function'
      ? new TextEncoder().encode(serialized).length
      : new Blob([serialized]).size;
    if (serializedBytes > QUESTION_BANK_MAX_BYTES) {
      throw new Error('题库数据超过 8MB，请先导出备份或拆分题库');
    }
    let gmWritten = false;
    try {
      if (typeof GM_setValue === 'function' && gmStorageIsSync !== false) {
        const result = GM_setValue(QUESTION_BANK_KEY, serialized);
        if (!result || typeof result.then !== 'function') {
          gmStorageIsSync = true;
          gmWritten = true;
        } else {
          gmStorageIsSync = false;
        }
      }
    } catch (e) { gmStorageIsSync = false; }
    if (!gmWritten) {
      try { localStorage.setItem(QUESTION_BANK_KEY, serialized); gmWritten = true; } catch (e) {
        throw new Error('题库存储失败，可能已达到浏览器存储上限');
      }
    }
    return true;
  }

  function makeEmptyQuestionBank(name) {
    const now = new Date().toISOString();
    return {
      id: `bank-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: String(name || '默认题库').trim().substring(0, 80) || '默认题库',
      createdAt: now, updatedAt: now,
      typeOrder: [],
      results: Object.fromEntries(QUESTION_BANK_TYPES.map(type => [type, []]))
    };
  }

  function normalizeBankRichContent(content) {
    let source = content;
    if (!Array.isArray(source)) {
      if (typeof source === 'string' || typeof source === 'number') source = [{ type: 'text', text: String(source) }];
      else if (source && typeof source === 'object' && Array.isArray(source.content)) source = source.content;
      else if (source && typeof source === 'object' && (source.text || source.value)) source = [{ type: 'text', text: String(source.text || source.value) }];
      else return [];
    }
    return normalizeRichContent(source.map(part => {
      if (typeof part === 'string' || typeof part === 'number') return { type: 'text', text: String(part).substring(0, 20000) };
      if (!part || typeof part !== 'object') return null;
      if (part.type === 'text') return { type: 'text', text: String(part.text || '').substring(0, 20000) };
      if (part.type === 'break') return { type: 'break' };
      if (part.type === 'image' && part.url) {
        return { type: 'image', url: String(part.url).substring(0, 4096), alt: String(part.alt || '').substring(0, 300) };
      }
      return null;
    }).filter(Boolean));
  }

  function normalizeImportedBankType(value, question) {
    const raw = String(value || '').toLowerCase();
    const detected = detectTypeFromText(value);
    if (detected) return detected;
    if (/multiple|multi[_ -]?choice|checkbox/.test(raw)) return '多选';
    if (/single|radio|choice/.test(raw)) return '单选';
    if (/judge|true[_ -]?false/.test(raw)) return '判断';
    if (/fill|blank/.test(raw)) return '填空';
    if (/essay|subjective|short[_ -]?answer/.test(raw)) return '简答';
    const options = Array.isArray(question && question.options) ? question.options : [];
    const answer = String(question && (question.correctAnswer || question.answer || question.rightAnswer) || '');
    if (options.length > 1 && (/[,，、;；]/.test(answer) || /^[A-H]{2,}$/i.test(answer.replace(/\s/g, '')))) return '多选';
    if (options.length === 2 && /^(正确|错误|对|错|√|×|true|false)$/i.test(answer.trim())) return '判断';
    return options.length ? '单选' : '填空';
  }

  function getImportedBankResultLists(source) {
    const grouped = Object.fromEntries(QUESTION_BANK_TYPES.map(type => [type, []]));
    const rawResults = source && source.results;
    const flatQuestions = Array.isArray(rawResults) ? rawResults
      : Array.isArray(source && source.questions) ? source.questions
        : Array.isArray(source && source.items) ? source.items : null;
    if (flatQuestions) {
      flatQuestions.forEach(question => {
        const type = normalizeImportedBankType(question && (question.typeName || question.type || question.questionType), question);
        grouped[type].push(question);
      });
      return grouped;
    }
    if (rawResults && typeof rawResults === 'object') {
      Object.entries(rawResults).forEach(([rawType, list]) => {
        if (!Array.isArray(list)) return;
        list.forEach(question => {
          const type = QUESTION_BANK_TYPES.includes(rawType) ? rawType : normalizeImportedBankType(rawType, question);
          grouped[type].push(question);
        });
      });
    }
    return grouped;
  }

  function normalizeBankQuestion(question) {
    if (!question || typeof question !== 'object') return null;
    const rawStem = hasRichContent(question.stemContent) ? question.stemContent
      : question.stem ?? question.question ?? question.title ?? '';
    const rawStemText = typeof rawStem === 'string' || typeof rawStem === 'number' ? String(rawStem).trim() : '';
    const stemContent = normalizeBankRichContent(rawStem);
    const stem = formatRichForText(stemContent).trim() || rawStemText;
    if (!stem && !hasRichContent(stemContent)) return null;
    const rawOptions = Array.isArray(question.options) ? question.options
      : Array.isArray(question.option) ? question.option
        : Array.isArray(question.choices) ? question.choices : [];
    const options = rawOptions.map((option, index) => {
      const rawText = typeof option === 'string' || typeof option === 'number' ? String(option)
        : String((option && (option.text ?? option.value ?? option.option ?? option.name)) || '');
      const prefixed = rawText.match(/^\s*([A-H])\s*(?:[.、．:：]|\s+)\s*/i);
      const optionValue = prefixed ? rawText.slice(prefixed[0].length) : (option && option.content != null ? option.content : rawText);
      const rawOptionText = typeof optionValue === 'string' || typeof optionValue === 'number' ? String(optionValue).trim() : '';
      const content = normalizeBankRichContent(optionValue);
      const letter = String((option && (option.letter || option.key || option.label)) || (prefixed && prefixed[1]) || String.fromCharCode(65 + index)).trim().toUpperCase().substring(0, 1);
      return { letter, text: richTextOnly(content) || rawOptionText, content };
    }).filter(option => /^[A-H]$/.test(option.letter) && (option.text || hasRichContent(option.content)));
    const rawAnswer = hasRichContent(question.correctAnswerContent) ? question.correctAnswerContent
      : question.correctAnswer ?? question.answer ?? question.rightAnswer ?? question.correct ?? '';
    const correctAnswerContent = stripAnswerLabel(normalizeBankRichContent(rawAnswer));
    const answer = (richTextOnly(correctAnswerContent) || String(rawAnswer || '').trim())
      .replace(/^\s*(?:答案|正确答案|answer)\s*[：:：]?\s*/i, '').trim();
    // 不把某一次作答/错题状态带进可复用题库，避免题库载入后误显示旧错题。
    return {
      stem, stemContent, options,
      correctAnswer: answer, correctAnswerContent,
      myAnswer: '', isWrong: false
    };
  }

  function normalizeQuestionBank(bank) {
    const source = bank && typeof bank === 'object' ? bank : makeEmptyQuestionBank('默认题库');
    const normalized = makeEmptyQuestionBank(source.name || source.exam_id || '默认题库');
    normalized.id = String(source.id || normalized.id);
    normalized.createdAt = source.createdAt || normalized.createdAt;
    normalized.updatedAt = source.updatedAt || normalized.updatedAt;
    const rawResults = getImportedBankResultLists(source);
    const typeOrder = Array.isArray(source.typeOrder) ? source.typeOrder : [];
    const order = [...QUESTION_BANK_TYPES.filter(type => typeOrder.includes(type)), ...QUESTION_BANK_TYPES.filter(type => !typeOrder.includes(type))];
    const seen = new Set();
    order.forEach(type => {
      const list = Array.isArray(rawResults[type]) ? rawResults[type] : [];
      normalized.results[type] = list.map(normalizeBankQuestion).filter(Boolean).filter(question => {
        const identity = getQuestionIdentity(type, question) || `${type}|${richContentIdentity(question.stemContent)}`;
        if (seen.has(identity)) return false;
        seen.add(identity);
        return true;
      });
      if (normalized.results[type].length) normalized.typeOrder.push(type);
    });
    return normalized;
  }

  function makeDefaultQuestionBankState() {
    const bank = makeEmptyQuestionBank('默认题库');
    return { schemaVersion: 1, activeBankId: bank.id, banks: [bank] };
  }

  function normalizeQuestionBankState(raw) {
    let source = raw;
    if (typeof source === 'string') {
      try { source = JSON.parse(source); } catch (e) { source = null; }
    }
    if (!source || typeof source !== 'object') return makeDefaultQuestionBankState();
    // 单库备份使用 {schemaVersion, bank}，完整备份使用 {banks:[...]}。
    if (source.bank && typeof source.bank === 'object') source = { schemaVersion: 1, banks: [source.bank], activeBankId: source.bank.id };
    // 兼容 OCS { exam_id, questions }，以及直接导出的题目数组。
    if (!Array.isArray(source.banks) && Array.isArray(source.questions)) {
      source = { schemaVersion: 1, banks: [{ name: source.exam_id || '导入题库', questions: source.questions }] };
    }
    if (Array.isArray(source) && !source.some(item => item && typeof item === 'object' && (item.results || item.questions || item.name))) {
      source = { schemaVersion: 1, banks: [{ name: '导入题库', results: source }] };
    }
    // 兼容参考脚本的 {题库名: [题目]} 结构，导入后统一转换为本脚本格式。
    if (!Array.isArray(source.banks) && !Array.isArray(source)) {
      const banks = Object.entries(source).filter(([, value]) => Array.isArray(value)).map(([name, results]) => normalizeQuestionBank({ name, results }));
      if (banks.length) return { schemaVersion: 1, activeBankId: banks[0].id, banks };
    }
    const banks = (Array.isArray(source.banks) ? source.banks : Array.isArray(source) ? source : [])
      .map(normalizeQuestionBank).filter(Boolean);
    if (!banks.length) return makeDefaultQuestionBankState();
    const activeBankId = banks.some(bank => bank.id === source.activeBankId) ? source.activeBankId : banks[0].id;
    return { schemaVersion: 1, activeBankId, banks };
  }

  function loadQuestionBankState(force = false) {
    if (questionBankStateCache && !force) return questionBankStateCache;
    questionBankStateCache = normalizeQuestionBankState(readQuestionBankValue());
    // 首次使用立即建立默认题库；如果已有旧数据，规范化后再保存一次。
    try { writeQuestionBankValue(JSON.stringify(questionBankStateCache)); } catch (e) { /* UI 操作时再提示 */ }
    return questionBankStateCache;
  }

  function saveQuestionBankState(state) {
    const normalized = normalizeQuestionBankState(state);
    normalized.banks.forEach(bank => { bank.updatedAt = bank.updatedAt || new Date().toISOString(); });
    writeQuestionBankValue(JSON.stringify(normalized));
    questionBankStateCache = normalized;
    return normalized;
  }

  function getActiveQuestionBank() {
    const state = loadQuestionBankState();
    return state.banks.find(bank => bank.id === state.activeBankId) || state.banks[0] || null;
  }

  function setActiveQuestionBank(id) {
    const state = loadQuestionBankState();
    if (!state.banks.some(bank => bank.id === id)) return false;
    state.activeBankId = id;
    saveQuestionBankState(state);
    return true;
  }

  function bankQuestionCount(bank) {
    return QUESTION_BANK_TYPES.reduce((sum, type) => sum + ((bank && bank.results && bank.results[type]) || []).length, 0);
  }

  function bankTotalCount(state = loadQuestionBankState()) {
    return state.banks.reduce((sum, bank) => sum + bankQuestionCount(bank), 0);
  }

  function bankQuestionIdentity(type, question) {
    const base = getQuestionIdentity(type, question);
    if (base) return base;
    return `${type}|${richContentIdentity(questionContent(question))}|${(question.options || []).map(option => richContentIdentity(optionContent(option))).join('|')}`;
  }

  function buildExtractedDataFromBank(bank) {
    const normalized = normalizeQuestionBank(bank);
    const results = Object.fromEntries(QUESTION_BANK_TYPES.map(type => [type, (normalized.results[type] || []).map(question => ({ ...question }))]));
    const data = {
      title: normalized.name, typeOrder: normalized.typeOrder.slice(), results,
      text: '', textWithAnswers: '', textWrong: '', textMD: '',
      textWithAnswersMD: '', textWrongMD: ''
    };
    return refreshExtractedOutputCache(data);
  }

  function mergeExtractedDataIntoBank(bank, data) {
    const target = normalizeQuestionBank(bank);
    const seen = new Map();
    QUESTION_BANK_TYPES.forEach(type => (target.results[type] || []).forEach(question => seen.set(bankQuestionIdentity(type, question), question)));
    let added = 0, skipped = 0, answersFilled = 0;
    Object.entries((data && data.results) || {}).forEach(([type, questions]) => {
      if (!QUESTION_BANK_TYPES.includes(type)) return;
      if (!Array.isArray(target.results[type])) target.results[type] = [];
      questions.forEach(rawQuestion => {
        const question = normalizeBankQuestion(rawQuestion);
        if (!question) return;
        const identity = bankQuestionIdentity(type, question);
        const existing = seen.get(identity);
        if (existing) {
          skipped++;
          if (!hasRichContent(answerContent(existing)) && hasRichContent(answerContent(question))) {
            existing.correctAnswerContent = question.correctAnswerContent;
            existing.correctAnswer = question.correctAnswer;
            answersFilled++;
          }
          return;
        }
        target.results[type].push(question);
        seen.set(identity, question);
        if (!target.typeOrder.includes(type)) target.typeOrder.push(type);
        added++;
      });
    });
    target.updatedAt = new Date().toISOString();
    return { bank: normalizeQuestionBank(target), added, skipped, answersFilled };
  }

  function createExtractedDataFromResults(results, typeOrder, title) {
    const data = { title: title || '学习通题库', results: {}, typeOrder: [] };
    QUESTION_BANK_TYPES.forEach(type => { data.results[type] = Array.isArray(results && results[type]) ? results[type] : []; });
    (typeOrder || QUESTION_BANK_TYPES).forEach(type => {
      if (data.results[type] && data.results[type].length && !data.typeOrder.includes(type)) data.typeOrder.push(type);
    });
    return refreshExtractedOutputCache(data);
  }

  // ==================== 快捷键 ====================
  function formatShortcutLabel(sc) {
    const parts = [];
    if (sc.ctrl) parts.push('Ctrl');
    if (sc.shift) parts.push('Shift');
    if (sc.alt) parts.push('Alt');
    parts.push(sc.key.toUpperCase());
    return parts.join(' + ');
  }

  function isShortcutMatch(e, sc) {
    return e.ctrlKey === sc.ctrl &&
           e.shiftKey === sc.shift &&
           e.altKey === sc.alt &&
           e.key.toLowerCase() === sc.key.toLowerCase();
  }

  document.addEventListener('keydown', (e) => {
    // 如果正在录制快捷键，忽略
    if (window.__xxt_recording) return;
    if (!isShortcutMatch(e, currentSettings.shortcut)) return;

    e.preventDefault();
    const panel = document.getElementById('xxt-panel');
    const btnExtract = document.getElementById('xxt-btnExtract');

    if (!panel) return;

    // 触发提取
    if (btnExtract && !btnExtract.disabled) {
      btnExtract.click();
    }
  });

  // ==================== 提取逻辑 ====================
  const TYPE_MAP = {
    '多选题': '多选', '单选题': '单选', '选择题': '单选',
    '填空题': '填空', '判断题': '判断', '简答题': '简答',
    '论述题': '简答', '问答题': '简答',
  };

  function detectTypeFromText(text) {
    const value = String(text || '');
    for (const [label, type] of Object.entries(TYPE_MAP)) {
      if (value.includes(label)) return type;
    }
    // 随堂练习部分版本使用英文题型名或“正误题”等别名。
    if (/单项选择|single.?choice|radio/i.test(value)) return '单选';
    if (/多项选择|multiple.?choice|checkbox/i.test(value)) return '多选';
    if (/正误题|是非题|true.?false|judg(e|ment)/i.test(value)) return '判断';
    if (/填空|fill.?blank/i.test(value)) return '填空';
    if (/论述|问答|简答|essay|subjective/i.test(value)) return '简答';
    return null;
  }

  // 兼容随堂练习不同版本的题型属性命名。
  function questionAttributeText(el) {
    if (!el || !el.getAttribute) return '';
    const names = [
      'typeName', 'typename', 'data-type-name', 'data-question-type',
      'data-type', 'questiontype', 'questionType', 'qtype', 'type'
    ];
    return names.map(name => el.getAttribute(name) || '').filter(Boolean).join(' ');
  }

  function findQuestionType(question, stemEl) {
    if (!question) return null;

    const attrType = detectTypeFromText(questionAttributeText(question));
    if (attrType) return attrType;

    const typeSelectors = [
      '.newZy_TItle', '.questionType', '.question_type', '.typeName',
      '.type_name', '.qtype', '[data-role="question-type"]', '[data-role="type"]'
    ];
    for (const selector of typeSelectors) {
      const typeEl = question.querySelector(selector);
      const type = typeEl && detectTypeFromText(typeEl.textContent || '');
      if (type) return type;
    }

    // 有些随堂练习把“【单选题】”直接放在题干前面。
    const ownText = question.textContent || '';
    const ownType = detectTypeFromText(ownText);
    if (ownType) return ownType;
    if (stemEl) {
      const stemType = detectTypeFromText(stemEl.textContent || '');
      if (stemType) return stemType;
    }

    // 题型标题可能是题目容器的前一个兄弟节点。
    let node = question;
    for (let depth = 0; node && depth < 4; depth++, node = node.parentElement) {
      let previous = node.previousElementSibling;
      for (let count = 0; previous && count < 3; count++, previous = previous.previousElementSibling) {
        const text = previous.textContent || '';
        if (!/(题|选择|判断|填空|问答|论述)/.test(text)) continue;
        const type = detectTypeFromText(text);
        if (type) return type;
      }
    }
    return null;
  }

  function findQuestionStemElement(question) {
    if (!question) return null;
    const selectors = [
      '.mark_name', '.qtContent', '.Zy_TItle .qtContent',
      '.questionTitle', '.question_title', '.question-title',
      '.q_title', '.que_title', '.stem', '.questionStem',
      '[data-role="question"]', '[data-role="stem"]'
    ];
    for (const selector of selectors) {
      const el = question.querySelector(selector);
      if (el && (el.textContent || '').trim() || el && el.querySelector('img')) return el;
    }
    return null;
  }

  function extractQuestionNumber(question, stemEl) {
    const attrNames = ['data-index', 'data-num', 'data-number', 'questionindex', 'index', 'num'];
    for (const name of attrNames) {
      const value = question && question.getAttribute && question.getAttribute(name);
      const match = String(value || '').match(/\d+/);
      if (match) return parseInt(match[0], 10);
    }
    const selectors = ['.q_num', '.questionNum', '.question_num', '.num', 'i.fl'];
    for (const selector of selectors) {
      const el = question && question.querySelector(selector);
      const match = el && (el.textContent || '').match(/\d+/);
      if (match) return parseInt(match[0], 10);
    }
    const text = stemEl ? stemEl.textContent || '' : question && question.textContent || '';
    const match = text.match(/^\s*(\d+)\s*[.、)）]/);
    return match ? parseInt(match[1], 10) : 0;
  }

  // ==================== 富文本提取基础设施 ====================
  // 块级标签：遍历子节点后自动追加换行，保证图文混排时段落结构正确
  const RICH_BLOCK_TAGS = new Set(['P', 'DIV', 'LI', 'DD', 'DT', 'TR', 'TABLE', 'SECTION']);

  // 多属性 fallback 解析图片 URL，兼容学习通各种图片加载方式
  function resolveImageUrl(img) {
    if (!img) return '';
    const attrs = ['src', 'data-src', 'data-original', 'origin-src', 'fileid'];
    for (const attr of attrs) {
      const value = img.getAttribute(attr);
      if (value && value.trim()) return value.trim();
    }
    return img.currentSrc || img.src || '';
  }

  // 规范化富文本数组：合并相邻文本节点、去首尾空行、压缩空白
  function normalizeRichContent(parts) {
    const normalized = [];
    const pushText = (text) => {
      if (!text) return;
      const value = text.replace(/\u00a0/g, ' ').replace(/[ \t\r\f]+/g, ' ');
      if (!value) return;
      const last = normalized[normalized.length - 1];
      if (last && last.type === 'text') last.text += value;
      else normalized.push({ type: 'text', text: value });
    };
    const pushBreak = () => {
      const last = normalized[normalized.length - 1];
      if (!last || last.type !== 'break') normalized.push({ type: 'break' });
    };

    for (const part of parts || []) {
      if (!part) continue;
      if (part.type === 'text') {
        pushText(part.text);
      } else if (part.type === 'image' && part.url) {
        normalized.push(part);
      } else if (part.type === 'break') {
        pushBreak();
      }
    }

    while (normalized[0] && normalized[0].type === 'break') normalized.shift();
    while (normalized[normalized.length - 1] && normalized[normalized.length - 1].type === 'break') normalized.pop();
    return normalized;
  }

  // ==================== 章节测验加密字体还原 ====================
  // 学习通使用 font-cxsecret 把乱码 Unicode 映射到真实汉字字形。
  // 不能从 cmap 或 glyph 名称猜原字，改用 OCS/ScriptCat 432 的方案：
  // Typr 解析内嵌字体，计算每个中文字形路径的 MD5，再查映射表。
  const fontCipherState = {
    // 顶层页面和多个 iframe 可能同时初始化；按 Document 隔离并发准备，
    // 避免 iframe 复用另一个文档的 Promise 而跳过自身解密。
    preparingByDocument: new WeakMap(),
    // 学习通 font-cxsecret 的字形路径 → 原始汉字映射（OCS/ScriptCat 432 同源方案）
    secretMap: null,
    secretMapLoading: null,
    // 每个文档单独缓存当前 font-cxsecret 字体的“乱码码点 → 原字”映射。
    // 页面动态追加题目时仍会继续处理新出现的 .font-cxsecret 节点。
    secretReplacementsByDocument: new WeakMap(),
  };

  function getUserscriptGlobal(name) {
    // @require 脚本在不同脚本管理器中可能挂到沙箱、页面 window 或
    // unsafeWindow；逐个取值，避免“依赖已加载但当前作用域取不到”的情况。
    const candidates = [];
    try { if (typeof unsafeWindow !== 'undefined') candidates.push(unsafeWindow); } catch (e) {}
    try { if (typeof globalThis !== 'undefined') candidates.push(globalThis); } catch (e) {}
    try { if (typeof window !== 'undefined') candidates.push(window); } catch (e) {}
    for (const scope of candidates) {
      try { if (scope && scope[name]) return scope[name]; } catch (e) {}
    }
    return null;
  }

  function getTyprApi() {
    try { if (typeof Typr !== 'undefined' && Typr) return Typr; } catch (e) {}
    return getUserscriptGlobal('Typr');
  }

  function getMd5Api() {
    try { if (typeof md5 !== 'undefined' && md5) return md5; } catch (e) {}
    return getUserscriptGlobal('md5');
  }

  function base64ToUint8Array(base64) {
    const data = window.atob(String(base64 || '').replace(/\s/g, ''));
    const buffer = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) buffer[i] = data.charCodeAt(i);
    return buffer;
  }

  async function loadCxSecretFontMap() {
    if (fontCipherState.secretMap) return fontCipherState.secretMap;
    if (fontCipherState.secretMapLoading) return fontCipherState.secretMapLoading;

    // 优先使用 @resource，避免页面 CSP/CORS 阻止跨域 fetch；网络加载作为兜底。
    try {
      if (typeof GM_getResourceText === 'function') {
        const bundled = GM_getResourceText('XXT_FONT_TABLE');
        if (bundled) {
          const map = JSON.parse(bundled);
          if (map && typeof map === 'object') {
            fontCipherState.secretMap = map;
            return map;
          }
        }
      }
    } catch (e) {}

    const tableUrl = 'https://cdn.ocsjs.com/resources/font/table.json';
    const parseMap = value => {
      const map = typeof value === 'string' ? JSON.parse(value) : value;
      return map && typeof map === 'object' ? map : {};
    };
    const loadByRequest = () => new Promise((resolve, reject) => {
      try {
        if (typeof GM_xmlhttpRequest !== 'function') return reject(new Error('GM_xmlhttpRequest unavailable'));
        GM_xmlhttpRequest({
          method: 'GET', url: tableUrl, timeout: 30000,
          onload: response => {
            if (response.status >= 200 && response.status < 300) {
              try { resolve(parseMap(response.responseText)); } catch (e) { reject(e); }
            } else reject(new Error(`字体映射表加载失败：${response.status}`));
          },
          onerror: () => reject(new Error('字体映射表网络请求失败')),
          ontimeout: () => reject(new Error('字体映射表请求超时')),
        });
      } catch (e) { reject(e); }
    });
    fontCipherState.secretMapLoading = loadByRequest().catch(() => fetch(tableUrl, {
      credentials: 'omit',
    })).then(response => {
      if (response && !response.ok) throw new Error(`字体映射表加载失败：${response.status}`);
      return response && typeof response.json === 'function' ? response.json() : response;
    }).then(parseMap).then(map => {
      fontCipherState.secretMap = map;
      return map;
    }).catch(error => {
      // 不缓存失败状态，稍后页面网络恢复时允许再次尝试。
      fontCipherState.secretMapLoading = null;
      window.__xxt_font_cipher_debug = { ok: false, reason: String(error && error.message || error) };
      return {};
    });
    return fontCipherState.secretMapLoading;
  }

  function extractEmbeddedFontBase64(cssText) {
    const css = String(cssText || '');
    const marker = /base64\s*,/ig;
    let found;
    while ((found = marker.exec(css))) {
      const rest = css.slice(marker.lastIndex);
      // 以 CSS data URL 的引号、右括号、分号或 format() 为结束；
      // 不能用“Base64 字符类”直接贪吃，因为 format 也是字母，会被误纳入字体。
      const candidate = (rest.match(/^([\s\S]*?)(?=['")]|;|\s+format\s*\()/i) || ['', ''])[1]
        .replace(/\s/g, '');
      if (candidate.length < 64) continue;
      try {
        const bytes = base64ToUint8Array(candidate);
        const header = String.fromCharCode(...bytes.slice(0, 4));
        // sfnt/TrueType 头为 00 01 00 00；OTF、TTC 也可由 Typr 解析。
        // TyprMd5.js 的 Typr.parse 直接支持 sfnt/OTF/TTC；它不支持
        // WOFF 容器，因此不要把 WOFF 当作可解析字体交给 Typr。
        if (header === '\u0000\u0001\u0000\u0000' || header === 'OTTO' || header === 'ttcf') {
          return candidate;
        }
      } catch (e) {}
    }
    return '';
  }

  function getCxSecretTargets(root) {
    const scope = root && root.querySelectorAll ? root : document;
    // 旧版模板直接给元素添加 class；新版可能只通过 class 的组合形式，
    // 或仅通过 font-family 继承加密字体。
    const classTargets = Array.from(scope.querySelectorAll('.font-cxsecret, [class*="font-cxsecret"]'));
    // OCS 的 getSecretFont 会优先取 .after：加密字体容器有时同时包含
    // 选项按钮/伪元素，直接改写整个容器会破坏按钮结构。
    const targets = new Set(classTargets.map(element => element.querySelector('.after') || element));
    if (scope.querySelector('style') && !targets.size) {
      Array.from(scope.querySelectorAll('body *')).forEach(element => {
        try {
          if (/font-cxsecret/i.test(getComputedStyle(element).fontFamily || '')) targets.add(element);
        } catch (e) {}
      });
    }
    // 若父元素已经命中，则不再重复扫描其中的子元素，避免重复改写文本节点。
    return {
      classTargets,
      targets: Array.from(targets).filter(element => !Array.from(targets)
        .some(parent => parent !== element && parent.contains(element))),
    };
  }

  async function decodeCxSecretFont(root) {
    const doc = root && root.nodeType === Node.DOCUMENT_NODE
      ? root
      : (root && root.ownerDocument) || document;
    const targetInfo = getCxSecretTargets(doc);
    const targets = targetInfo.targets;
    if (!targets.length) {
      window.__xxt_font_cipher_debug = {
        ok: false,
        reason: '未找到 font-cxsecret 目标元素',
        classTargets: targetInfo.classTargets.length,
        styles: doc.querySelectorAll ? doc.querySelectorAll('style').length : 0,
      };
      return 0;
    }

    // 兼容章节测验把 @font-face 放在 body 或动态容器中的模板。遍历所有
    // 相关 style，不能只取第一个无 base64 的样式。
    let encodedFont = '';
    for (const style of Array.from(doc.querySelectorAll('style'))) {
      if (!/font-cxsecret/i.test(style.textContent || '')) continue;
      // Base64 中允许换行；按 OCS/ScriptCat 的实现，以 data URL 的
      // 引号、右括号或分号作为结束，不能在普通空白处提前截断。
      encodedFont = extractEmbeddedFontBase64(style.textContent || '');
      // 保留 OCS/ScriptCat 的宽松兜底：个别页面的 CSS data URL 没有
      // 标准引号/分号，且字体头部可能由浏览器自动处理，不能因此放弃。
      if (!encodedFont) {
        const fallback = (style.textContent || '').match(/base64,([\w\W]+?)['"]/i);
        if (fallback && fallback[1]) encodedFont = fallback[1].replace(/\s/g, '');
      }
      if (encodedFont) break;
    }
    const typr = getTyprApi();
    const md5Fn = getMd5Api();
    if (!encodedFont || !typr || !md5Fn) {
      window.__xxt_font_cipher_debug = { ok: false, reason: '依赖或内嵌字体未找到', hasTargets: targets.length, hasStyle: !!encodedFont };
      return 0;
    }

    let cached = fontCipherState.secretReplacementsByDocument.get(doc);
    if (!cached || cached.signature !== encodedFont) {
      const table = await loadCxSecretFontMap();
      if (!table || !Object.keys(table).length) return 0;
      try {
        // 与 OCS 和 ScriptCat「超星字体解密」相同：不能从 cmap 或 glyph 名
        // 推断原字，必须以绘制路径的 MD5 到原始汉字表中反查。
        const parsed = typr.parse(base64ToUint8Array(encodedFont));
        // Typr.js 的 parse 返回字体数组；兼容不同打包版本的单对象返回值。
        const font = Array.isArray(parsed) ? parsed[0] : parsed;
        if (!font) return 0;
        const replacements = new Map();
        for (let codePoint = 19968; codePoint < 40870; codePoint++) {
          const glyph = typr.U.codeToGlyph(font, codePoint);
          if (!glyph) continue;
          const path = typr.U.glyphToPath(font, glyph);
          const fingerprint = md5Fn(JSON.stringify(path)).slice(24);
          const original = Number(table[fingerprint]);
          if (Number.isInteger(original) && original >= 0x4e00 && original <= 0x9fff) {
            replacements.set(codePoint, String.fromCharCode(original));
          }
        }
        if (!replacements.size) {
          window.__xxt_font_cipher_debug = { ok: false, reason: '字形指纹未匹配到映射表', fontBytes: encodedFont.length };
          return 0;
        }
        cached = { signature: encodedFont, replacements };
        fontCipherState.secretReplacementsByDocument.set(doc, cached);
      } catch (e) {
        window.__xxt_font_cipher_debug = {
          ok: false,
          reason: String(e && e.message || e),
          fontBytes: encodedFont.length,
          hasTypr: !!typr,
          hasMd5: !!md5Fn,
        };
        return 0;
      }
    }

    const replacements = cached.replacements;
    window.__xxt_font_cipher_debug = { ok: true, targets: targets.length, replacements: replacements.size, fontBytes: encodedFont.length };
    targets.forEach(element => {
      // 只替换文本节点，保留选项按钮、图片、公式等既有 DOM 结构。
      const walker = doc.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach(node => {
        const replaced = Array.from(node.nodeValue || '', char => {
          const replacement = replacements.get(char.codePointAt(0));
          return replacement || char;
        }).join('');
        if (replaced !== node.nodeValue) node.nodeValue = replaced;
      });
    });
    // 即使实际文字节点位于 .after，也必须从其原始容器移除加密字体类。
    // 否则轮询/MutationObserver 再次运行时会把已经还原的汉字二次映射。
    targetInfo.classTargets.forEach(element => element.classList.remove('font-cxsecret'));
    return replacements.size;
  }

  async function prepareFontCipherDecoder(root) {
    // 完成原文替换后，后续 extractRichContent/textContent 会自然得到正确文字。
    const doc = root && root.nodeType === Node.DOCUMENT_NODE
      ? root
      : (root && root.ownerDocument) || document;
    const pending = fontCipherState.preparingByDocument.get(doc);
    if (pending) return pending;
    const promise = decodeCxSecretFont(doc);
    fontCipherState.preparingByDocument.set(doc, promise);
    try {
      return await promise;
    } finally {
      if (fontCipherState.preparingByDocument.get(doc) === promise) {
        fontCipherState.preparingByDocument.delete(doc);
      }
    }
  }

  function decodeFontCipherText(text, element) {
    const raw = String(text || '');
    if (!raw || !element) return raw;

    // 不再读取 data-value/data-content/title 等祖先属性：学习通的选项容器
    // 经常把整条选项放进这些属性，逐个文本节点读取会造成“同一选项重复多次”。
    // DOM 预替换遗漏时，再按真正应用了 font-cxsecret 的元素按需还原。
    const doc = element.ownerDocument || document;
    const cached = fontCipherState.secretReplacementsByDocument.get(doc);
    if (!cached || !cached.replacements) return raw;
    let isCipherText = false;
    for (let node = element; node && node.nodeType === Node.ELEMENT_NODE; node = node.parentElement) {
      if (node.matches && node.matches('.font-cxsecret, [class*="font-cxsecret"]')) {
        isCipherText = true;
        break;
      }
    }
    if (!isCipherText) {
      try { isCipherText = /font-cxsecret/i.test(getComputedStyle(element).fontFamily || ''); } catch (e) {}
    }
    if (!isCipherText) return raw;
    return Array.from(raw, char => cached.replacements.get(char.codePointAt(0)) || char).join('');
  }

  // 按 DOM 顺序提取富文本内容：保留文字、图片和换行的原始顺序
  function extractRichContent(el) {
    const parts = [];
    if (!el) return parts;

    const walk = (node) => {
      if (!node) return;
      if (node.nodeType === Node.TEXT_NODE) {
        parts.push({ type: 'text', text: decodeFontCipherText(node.nodeValue || '', node.parentElement) });
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;

      const tag = node.nodeType === Node.ELEMENT_NODE ? node.tagName : '';
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return;
      if (tag === 'IMG') {
        const url = resolveImageUrl(node);
        if (url) parts.push({ type: 'image', url, alt: node.getAttribute('alt') || '' });
        return;
      }
      if (tag === 'BR') {
        parts.push({ type: 'break' });
        return;
      }

      const beforeLen = parts.length;
      node.childNodes.forEach(walk);
      if (tag && RICH_BLOCK_TAGS.has(tag) && parts.length > beforeLen) parts.push({ type: 'break' });
    };

    el.childNodes.forEach(walk);
    return normalizeRichContent(parts);
  }

  // 将富文本数组转为纯文本，图片通过回调格式化
  function richContentToText(content, imageFormatter) {
    let text = '';
    for (const part of content || []) {
      if (part.type === 'text') text += part.text;
      else if (part.type === 'image') text += imageFormatter ? imageFormatter(part.url, part) : '';
      else if (part.type === 'break') text += '\n';
    }
    return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  // 从富文本首段剥离选项字母（A~H），返回字母和剩余内容
  function stripOptionPrefix(content) {
    const parts = (content || []).map(part => part.type === 'text' ? { ...part } : part);
    let letter = '';
    for (const part of parts) {
      if (part.type !== 'text') continue;
      if (!part.text.trim()) continue;
      const match = part.text.match(/^\s*([A-H])\s*[\.、．]?\s*/i);
      if (match) {
        letter = match[1].toUpperCase();
        part.text = part.text.slice(match[0].length);
      }
      break;
    }
    return { letter, content: normalizeRichContent(parts) };
  }

  // 剥离题干前缀：题号（如"1."）和题型标签（如"（单选题）"）
  function stripQuestionPrefix(content) {
    const parts = (content || []).map(part => part.type === 'text' ? { ...part } : part);
    let strippedNumber = false;
    let strippedType = false;
    for (const part of parts) {
      if (part.type !== 'text') continue;
      // 去除末尾的分数标记，如 (2.0)
      part.text = part.text.replace(/\s*\(\d+\.\d+\)\s*$/, '');
      if (!strippedNumber) {
        const before = part.text;
        part.text = part.text.replace(/^\s*\d+\.\s*/, '');
        if (part.text !== before || part.text.trim()) strippedNumber = true;
      }
      if (!strippedType) {
        const before = part.text;
        // 剥离已知题型标签（支持圆括号、方头括号、半角括号），避免误伤选项字母
        part.text = part.text.replace(/^\s*[［\[（【(](单选题|多选题|填空题|判断题|简答题|论述题|问答题|选择题)[］\]）】)]\s*/, '');
        if (part.text !== before || part.text.trim()) strippedType = true;
      }
    }
    return normalizeRichContent(parts);
  }

  // 剥离答案标签前缀（如"正确答案："）
  function stripAnswerLabel(content) {
    const parts = (content || []).map(part => part.type === 'text' ? { ...part } : part);
    for (const part of parts) {
      if (part.type !== 'text') continue;
      if (!part.text.trim()) continue;
      part.text = part.text.replace(/^\s*(正确答案|参考答案|答案)\s*[:：]?\s*/, '');
      break;
    }
    return normalizeRichContent(parts);
  }

  // 判断富文本是否有实质内容（文本或图片）
  function hasRichContent(content) {
    return (content || []).some(part => part.type === 'image' || (part.type === 'text' && part.text.trim()));
  }

  // 从“我的答案：B / 正确答案：C”所在的实际节点提取答案。
  // 学习通的作业详情、考试阅卷页会频繁调整 class，但标签文本保持稳定。
  function extractLabeledAnswerContent(qRoot, label) {
    if (!qRoot) return [];
    // 有些阅卷页把“正确答案”和答案值放在相邻 span，或使用零宽字符而没有冒号；
    // 标签本身仍可作为锚点，后续从整题文本中取其后的真实答案。
    const labelPattern = label === 'correct'
      ? /(?:正确\s*答案|参考\s*答案)(?!解析)\s*(?:[：:]\s*)?/
      : /我的\s*答案\s*(?:[：:]\s*)?/;
    // 题干中可能出现“下列哪个是正确答案？”之类的普通问句；它不是答案标签。
    // 只要标签后紧跟问号，就不能把题干误识别为正确答案。
    const isQuestionPhrase = (text, matched) => label === 'correct'
      && /^[\s]*[？?]/.test(String(text || '').slice((matched.index || 0) + matched[0].length));
    const candidates = Array.from(qRoot.querySelectorAll('*')).filter(el => {
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      const matched = text.match(labelPattern);
      if (!matched || isQuestionPhrase(text, matched)) return false;
      // 只取最内层、确实含该标签的答案节点，避免整个题目容器带入选项。
      return !Array.from(el.children).some(child => labelPattern.test((child.textContent || '').replace(/\s+/g, ' ').trim()));
    });
    for (const el of candidates) {
      const content = extractRichContent(el);
      const cleaned = (content || []).map(part => part.type === 'text'
        ? { ...part, text: part.text.replace(labelPattern, '') }
        : part);
      const normalized = normalizeRichContent(cleaned);
      if (hasRichContent(normalized)) return normalized;
    }

    // 某些新版阅卷页把“标签”和答案分别置于相邻 span；此时没有一个
    // 最内层节点同时带完整文本，改从当前题目的可见文本中精确截取答案。
    const plainText = (qRoot.textContent || '').replace(/[\u00a0\s]+/g, ' ').trim();
    const matched = Array.from(plainText.matchAll(new RegExp(labelPattern.source, 'g')))
      .find(match => !isQuestionPhrase(plainText, match));
    if (!matched) return [];
    let tail = plainText.slice((matched.index || 0) + matched[0].length);
    // 同一答案条中通常还紧随“我的答案/正确答案”、对错图标文本和得分。
    tail = tail.split(/(?=(?:我的\s*答案|正确\s*答案|参考\s*答案|答案解析|本题得分|得分|分值)\s*(?:[：:]\s*)?)/)[0];
    // 选择题答案必须只取 A-H，防止把“0分”等页面排版文本带入答案。
    const choice = tail.match(/^\s*([A-H](?:\s*[,，、;；|/]\s*[A-H])*)/i);
    if (choice) return [{ type: 'text', text: choice[1].replace(/[\s，、;；|/]/g, '').toUpperCase() }];
    const judgement = tail.match(/^\s*(√|✓|×|✕|✖|正确|错误|对|错|是|否|true|false)/i);
    if (judgement) return [{ type: 'text', text: judgement[1] }];
    // 填空或简答的答案保留到得分/状态标记之前。
    const text = tail.replace(/\s*(?:[√✓×✕✖]|\d+(?:\.\d+)?\s*分).*$/, '').trim();
    return text ? [{ type: 'text', text }] : [];
  }

  // 提取正确答案为富文本数组，保留图片和公式
  function extractCorrectAnswerContent(qLi) {
    const markAnswer = qLi.querySelector('.mark_answer');
    if (markAnswer) {
      const contents = [];
      markAnswer.querySelectorAll('.rightAnswerContent').forEach(el => {
        const content = stripAnswerLabel(extractRichContent(el));
        if (hasRichContent(content)) {
          if (contents.length > 0) contents.push({ type: 'text', text: '；' });
          contents.push(...content);
        }
      });
      if (contents.length > 0) return normalizeRichContent(contents);

      const markKey = markAnswer.querySelector('.mark_key');
      if (markKey) {
        const rightEl = markKey.querySelector('.colorGreen');
        if (rightEl) {
          const content = stripAnswerLabel(extractRichContent(rightEl));
          if (hasRichContent(content)) return content;
        }
      }

      const greenFill = markAnswer.querySelector('.mark_fill.colorGreen');
      if (greenFill) {
        const dds = greenFill.querySelectorAll('dd');
        const fillContents = [];
        dds.forEach(dd => {
          const content = stripAnswerLabel(extractRichContent(dd));
          if (hasRichContent(content)) {
            if (fillContents.length > 0) fillContents.push({ type: 'text', text: '；' });
            fillContents.push(...content);
          }
        });
        if (fillContents.length > 0) return normalizeRichContent(fillContents);
      }

      const fallbackSelectors = ['.mark_key .colorGreen', '.mark_fill.colorGreen'];
      for (const selector of fallbackSelectors) {
        const el = markAnswer.querySelector(selector);
        if (!el) continue;
        const content = stripAnswerLabel(extractRichContent(el));
        if (hasRichContent(content)) return content;
      }
    }
    // 不依赖 class 的最终回退，兼容截图中的“正确答案:C”新阅卷样式。
    return extractLabeledAnswerContent(qLi, 'correct');
  }

  function extractCorrectAnswer(qLi) {
    return richContentToText(extractCorrectAnswerContent(qLi), () => '').replace(/\s+/g, ' ').trim();
  }

  // 适配器：兼容新旧数据格式，统一返回富文本数组
  function questionContent(q) {
    if (hasRichContent(q.stemContent)) return q.stemContent;
    const parts = q.stem ? [{ type: 'text', text: q.stem }] : [];
    if (q.images && q.images.length) {
      q.images.forEach(url => parts.push({ type: 'break' }, { type: 'image', url }));
    }
    return normalizeRichContent(parts);
  }

  function optionContent(opt) {
    if (hasRichContent(opt.content)) return opt.content;
    return opt.text ? [{ type: 'text', text: opt.text }] : [];
  }

  function answerContent(q) {
    if (hasRichContent(q.correctAnswerContent)) return q.correctAnswerContent;
    return q.correctAnswer ? [{ type: 'text', text: q.correctAnswer }] : [];
  }

  // 编辑器使用可逆的纯文本表示：换行直接显示为编辑框中的自然换行，
  // 图片仍使用〔图片1〕占位符，保存时可以恢复原图片。
  function richContentToEditableText(content) {
    let imageIndex = 0;
    let text = '';
    for (const part of content || []) {
      if (part.type === 'text') text += part.text || '';
      else if (part.type === 'break') text += '\n';
      else if (part.type === 'image') text += `〔图片${++imageIndex}〕`;
    }
    return text.replace(/\n{3,}/g, '\n\n').trim();
  }

  function editableTextToRichContent(text, originalContent) {
    const originals = (originalContent || []).filter(part => part.type === 'image');
    const parts = [];
    const value = String(text || '').replace(/\r\n?/g, '\n');
    const token = /〔图片(\d+)〕/g;
    let last = 0;
    const pushText = (s) => { if (s) parts.push({ type: 'text', text: s }); };
    const pushValue = (s) => {
      const lines = String(s).split(/\n/);
      lines.forEach((line, i) => {
        pushText(line);
        if (i < lines.length - 1) parts.push({ type: 'break' });
      });
    };
    let match;
    while ((match = token.exec(value))) {
      pushValue(value.slice(last, match.index));
      const image = originals[parseInt(match[1], 10) - 1];
      if (image) parts.push({ ...image });
      else pushText(match[0]);
      last = match.index + match[0].length;
    }
    pushValue(value.slice(last));
    return normalizeRichContent(parts);
  }

  function rebuildDerivedQuestionFields(q) {
    applyScoreDerivedAnswer(q);
    q.stem = formatRichForText(questionContent(q));
    q.options = (q.options || []).map(opt => ({
      ...opt,
      text: richTextOnly(optionContent(opt)),
    }));
    q.correctAnswer = richTextOnly(answerContent(q));
    return q;
  }

  function toScoreNumber(value) {
    const matched = String(value ?? '').replace(/，/g, '.').match(/-?\d+(?:\.\d+)?/);
    if (!matched) return null;
    const score = Number(matched[0]);
    return Number.isFinite(score) ? score : null;
  }

  // 已批阅的章节测验/考试页有时只显示“我的答案 + 单题得分”，不展示正确答案。
  // 得分只用于内部判定错题；当页面没有答案时，把“我的答案”直接放入可编辑的
  // 附加答案，方便用户在题库/导出前自行修改，而不把得分写进界面或导出内容。
  function applyScoreDerivedAnswer(q) {
    if (!q) return q;
    const score = toScoreNumber(q.score);
    const maxScore = toScoreNumber(q.maxScore);
    const scoreKnown = score !== null && maxScore !== null && maxScore > 0;
    q.score = score === null ? null : score;
    q.maxScore = maxScore === null ? null : maxScore;
    // 未满分即说明该题没有完全答对；0 分是最常见的明确错题情形。
    q.wrongByScore = !!(scoreKnown && score < maxScore);
    q.partialByScore = !!(scoreKnown && score > 0 && score < maxScore);
    q.fullScoreByScore = !!(scoreKnown && score > 0 && Math.abs(score - maxScore) < 0.000001);

    const editableAnswer = String(q.myAnswer || '').trim();
    if (editableAnswer && !hasRichContent(answerContent(q))) {
      q.correctAnswerContent = [{ type: 'text', text: editableAnswer }];
      q.correctAnswer = editableAnswer;
      // 保留来源供内部判断：满分时是已确认答案，其他情况是可编辑的我的作答。
      q.correctAnswerSource = q.fullScoreByScore ? 'full-score' : 'my-answer-editable';
    }
    return q;
  }

  function unavailableCorrectAnswerText(q) {
    if (q && q.wrongByScore) return '（页面未显示正确答案）';
    return '（未找到答案）';
  }

  function isDataAnswerWrong(q, qtype) {
    applyScoreDerivedAnswer(q);
    if (q.wrongByScore) return true;
    if (qtype === '简答' || !q.myAnswer) return false;
    const correct = richTextOnly(answerContent(q));
    if (!correct) return false;
    return !answersEqual(q.myAnswer, correct, qtype);
  }

  function recalculateExtractedMeta(data) {
    if (!data || !data.results) return data;
    let total = 0, wrongCount = 0, hasMyAnswer = false, hasCorrectAnswer = false;
    const order = data.typeOrder || Object.keys(data.results);
    for (const qtype of order) {
      const questions = data.results[qtype] || [];
      total += questions.length;
      for (const q of questions) {
        rebuildDerivedQuestionFields(q);
        if (q.myAnswer) hasMyAnswer = true;
        if (hasRichContent(answerContent(q))) hasCorrectAnswer = true;
        q.isWrong = isDataAnswerWrong(q, qtype);
        if (q.isWrong) wrongCount++;
      }
    }
    data.total = total;
    data.breakdown = Object.fromEntries(Object.entries(data.results).map(([k, v]) => [k, (v || []).length]));
    data.wrongCount = wrongCount;
    data.hasMyAnswer = hasMyAnswer;
    data.hasCorrectAnswer = hasCorrectAnswer;
    return data;
  }

  function refreshExtractedOutputCache(data) {
    if (!data) return data;
    recalculateExtractedMeta(data);
    data.text = formatOutput(data.results, data.typeOrder);
    data.textWithAnswers = formatOutputWithAnswers(data.results, data.typeOrder);
    data.textWrong = formatWrongQuestionsTXT(data.results, data.typeOrder);
    data.textMD = formatOutputMD(data.results, data.typeOrder);
    data.textWithAnswersMD = formatOutputWithAnswersMD(data.results, data.typeOrder);
    data.textWrongMD = formatWrongQuestionsMD(data.results, data.typeOrder);
    return data;
  }

  // Markdown URL 转义，防止特殊字符破坏图片语法
  function escapeMarkdownAlt(text) {
    return (text || '图片').replace(/[\[\]\n\r]/g, ' ').trim() || '图片';
  }

  function escapeMarkdownUrl(url) {
    // 编码 URL 中的特殊字符，防止破坏 Markdown 图片语法，保留已编码部分
    return (url || '').replace(/[()\\]/g, (ch) => '%' + ch.charCodeAt(0).toString(16).toUpperCase());
  }

  // 富文本格式化：TXT/MD 分别处理
  function formatRichForText(content) {
    return richContentToText(content, (url) => `\n[图片: ${url}]\n`);
  }

  function formatRichForMD(content) {
    return richContentToText(content, (url, part) => `\n![${escapeMarkdownAlt(part.alt)}](${escapeMarkdownUrl(url)})\n`);
  }

  // 富文本转纯文本（忽略图片）
  function richTextOnly(content) {
    return richContentToText(content || [], () => '').replace(/\s+/g, ' ').trim();
  }

  // 从旧版 li 元素提取选项（富文本）
  function extractOptionFromLegacyLi(li, index) {
    const parsed = stripOptionPrefix(extractRichContent(li));
    const letter = parsed.letter || String.fromCharCode(65 + index);
    const text = richTextOnly(parsed.content);
    if (letter && (text || hasRichContent(parsed.content))) {
      return { letter, text, content: parsed.content };
    }
    return null;
  }

  // 从新版 .answerBg 元素提取选项（富文本）
  function extractOptionFromAnswerBg(bg, index) {
    const numOption = bg.querySelector('.num_option');
    const answerP = bg.querySelector('.answer_p');
    if (numOption && answerP) {
      const letter = (numOption.getAttribute('data') || numOption.textContent.trim() || String.fromCharCode(65 + index)).trim().toUpperCase();
      const content = extractRichContent(answerP);
      const text = richTextOnly(content);
      if (letter && (text || hasRichContent(content))) return { letter, text, content };
    }
    return null;
  }

  // 兼容已完成考试的新版阅卷页：该页面通常用 .Zy_ulTop > li，
  // 而不是旧版限定的 .Zy_ulTop.qtDetail > li。
  function extractChoiceOptions(qDiv) {
    const options = [];
    const seenNodes = new Set();
    const byLetter = new Map();
    const sources = [
      ['.Zy_ulTop.qtDetail > li', 'legacy'],
      ['.Zy_ulTop > li', 'legacy'],
      ['.mark_letter > li', 'legacy'],
      ['.answerBg', 'answerBg'],
      ['.answer_bg', 'practice']
    ];
    sources.forEach(([selector, kind]) => {
      qDiv.querySelectorAll(selector).forEach(node => {
        if (seenNodes.has(node)) return;
        seenNodes.add(node);
        const parsed = kind === 'answerBg'
          ? extractOptionFromAnswerBg(node, options.length)
          : kind === 'legacy'
            ? extractOptionFromLegacyLi(node, options.length)
            : extractPracticeOption(node, options.length);
        if (!parsed || !/^[A-H]$/i.test(parsed.letter || '')) return;
        parsed.letter = parsed.letter.toUpperCase();
        const previous = byLetter.get(parsed.letter);
        if (!previous) {
          byLetter.set(parsed.letter, parsed);
          options.push(parsed);
        } else if (!hasRichContent(previous.content) && hasRichContent(parsed.content)) {
          const position = options.indexOf(previous);
          if (position >= 0) options[position] = parsed;
          byLetter.set(parsed.letter, parsed);
        }
      });
    });
    return options.sort((a, b) => a.letter.localeCompare(b.letter));
  }

  function extractMyAnswer(qLi, qtype) {
    const markAnswer = qLi.querySelector('.mark_answer');
    if (markAnswer) {
      // 单选/多选/判断：从 .mark_key 中提取
      const markKey = markAnswer.querySelector('.mark_key');
      if (markKey) {
        const mySpan = markKey.querySelector('.colorDeep .stuAnswerContent');
        if (mySpan && mySpan.textContent.trim()) return mySpan.textContent.trim();
      }

      // 填空：从 .mark_fill.colorDeep 中提取
      const deepFill = markAnswer.querySelector('.mark_fill.colorDeep');
      if (deepFill) {
        const spans = deepFill.querySelectorAll('.stuAnswerContent');
        if (spans.length > 0) return Array.from(spans).map(s => s.textContent.trim()).join('；');
      }
    }
    return richTextOnly(extractLabeledAnswerContent(qLi, 'my'));
  }

  function normalizeAnswerText(answer) {
    return String(answer || '')
      .replace(/^\s*(?:我的答案|正确答案|答案)\s*[：:]\s*/i, '')
      .replace(/[\u00a0\s]+/g, '')
      .replace(/[，、；;]/g, ',')
      .trim()
      .toLowerCase();
  }

  function normalizeChoiceAnswer(answer) {
    const normalized = normalizeAnswerText(answer).replace(/[,|/\\]+/g, '');
    return /^[a-h]+$/i.test(normalized)
      ? [...new Set(normalized.toUpperCase().split(''))].sort().join('')
      : normalized;
  }

  function normalizeJudgementAnswer(answer) {
    const normalized = normalizeAnswerText(answer).replace(/[。.!！]/g, '');
    if (/^(?:√|✓|对|正确|true|t|yes|是)$/i.test(normalized)) return 'true';
    if (/^(?:×|✕|✖|错|错误|不正确|false|f|no|否)$/i.test(normalized)) return 'false';
    return normalized;
  }

  function answersEqual(myAnswer, correctAnswer, qtype) {
    if (qtype === '单选' || qtype === '多选') {
      return normalizeChoiceAnswer(myAnswer) === normalizeChoiceAnswer(correctAnswer);
    }
    if (qtype === '判断') {
      return normalizeJudgementAnswer(myAnswer) === normalizeJudgementAnswer(correctAnswer);
    }
    return normalizeAnswerText(myAnswer) === normalizeAnswerText(correctAnswer);
  }

  function isAnswerWrong(qLi, myAnswer, correctAnswer, qtype) {
    if (qtype === '简答') return false; // 简答题不纳入错题统计
    if (!myAnswer) return false; // 没有我的答案，不算错题
    // 优先使用页面明确给出的判题状态，避免填空题同义答案等被字符串比较误判
    if (qLi.querySelector('.marking_dui, [class*="marking_dui"], .icon-dui, [class*="icon-dui"], .rightIcon, .answerRight, .icon-right')) return false;
    if (qLi.querySelector('.marking_cuo, [class*="marking_cuo"], .icon-cuo, [class*="icon-cuo"], .wrongIcon, .answerWrong, .icon-wrong')) return true;
    if (!correctAnswer) return false;
    return !answersEqual(myAnswer, correctAnswer, qtype);
  }

  // Fisher-Yates 洗牌算法，同类型题目内部打乱
  function shuffleQuestions(results, typeOrder) {
    const shuffled = {};
    for (const qtype of typeOrder) {
      const arr = [...(results[qtype] || [])];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      shuffled[qtype] = arr;
    }
    return shuffled;
  }

  function extract(options) {
    const preferIframe = !!(options && options.preferIframe);

    // 收到 iframe 的新消息后必须先消费这份消息，不能先从父页面或尚未
    // 完成切换的旧 iframe 中提取，否则切换随堂练习时会重复上一页题目。
    if (preferIframe) {
      const iframeData = window.__xxt_iframe_data;
      window.__xxt_iframe_data = null;
      window.__xxt_iframe_context = null;
      if (iframeData && hasQuestions(iframeData)) return iframeData;
      // 主动向 iframe 请求最新数据却没有收到响应时，不能再递归读取可能
      // 尚未替换的旧 iframe，否则仍会导出上一份随堂练习。
      if (options && options.iframeOnly) return emptyExtractResult();
    }

    // 优先从当前文档提取
    const topResult = extractFromRoot(document);
    if (hasQuestions(topResult)) return topResult;

    // 检查 iframe 通过 postMessage 发来的最新数据（跨域 iframe 回传）
    const iframeData = window.__xxt_iframe_data;
    window.__xxt_iframe_data = null; // 每次提取后清空，确保下次拿到最新数据
    window.__xxt_iframe_context = null;
    if (iframeData && hasQuestions(iframeData)) {
      return iframeData;
    }

    // 学生学习页面：题目在多层嵌套 iframe 中，递归查找（同源 iframe）
    const iframeResult = extractFromIframesRecursive(document);
    if (iframeResult) return iframeResult;

    // 兜底：返回空结果
    return emptyExtractResult();
  }

  // 用整页题目内容标识一次 iframe 结果，避免页面切换时把上一页结果
  // 当成当前页。完整签名可降低不同题目页发生碰撞的概率。
  function iframeDataSignature(data) {
    if (!data || !data.results) return '';
    let total = 0;
    let hash = 2166136261;
    const add = (value) => {
      const text = String(value || '');
      for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
      // 字段边界不能省略，例如“ab + c”和“a + bc”必须得到不同指纹。
      hash ^= 124;
      hash = Math.imul(hash, 16777619);
    };
    for (const type of Object.keys(data.results)) {
      const questions = data.results[type] || [];
      total += questions.length;
      add(type);
      add(questions.length);
      for (const q of questions) {
        add(String(q.stem || richTextOnly(q.stemContent || []) || '').replace(/\s+/g, ' ').trim());
        for (const option of (q.options || [])) {
          add(option.letter || '');
          add(String(option.text || richTextOnly(option.content || []) || '').replace(/\s+/g, ' ').trim());
        }
      }
    }
    return `${total}|${(hash >>> 0).toString(36)}`;
  }

  // 检查提取结果是否包含题目
  function hasQuestions(result) {
    return !!(result && result.results && Object.values(result.results).some(arr => Array.isArray(arr) && arr.length > 0));
  }

  function richContentIdentity(content) {
    return (content || []).map(part => {
      if (!part) return '';
      if (part.type === 'image') return `[图片:${String(part.url || '').slice(0, 4096)}:${String(part.alt || '').slice(0, 120)}]`;
      if (part.type === 'break') return '\n';
      return String(part.text || '');
    }).join('').replace(/\s+/g, ' ').trim();
  }

  function getQuestionIdentity(type, question) {
    if (!question) return '';
    const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
    const stem = normalize(question.stem || richContentIdentity(question.stemContent || []));
    if (!stem) return '';
    const options = (question.options || []).map(option =>
      `${normalize(option && option.letter)}:${normalize(option && (option.text || richContentIdentity(option.content || [])))}`
    ).join('|');
    return `${type}|${stem}|${options}`;
  }

  // 读取随堂练习页面中的作答内容（未提交时通常为空）。
  function extractPracticeMyAnswer(question, qtype) {
    if (!question) return '';
    const checked = Array.from(question.querySelectorAll('input[type="radio"]:checked, input[type="checkbox"]:checked'));
    if (checked.length > 0) {
      const values = checked.map(input => {
        const value = input.getAttribute('data-value') || input.getAttribute('value') || '';
        if (/^[A-H]$/i.test(value.trim())) return value.trim().toUpperCase();
        const label = input.closest('label') || input.parentElement;
        const parsed = label ? stripOptionPrefix(extractRichContent(label)) : null;
        return parsed && parsed.letter ? parsed.letter : value.trim();
      }).filter(Boolean);
      return values.join(qtype === '多选' ? ',' : '');
    }
    const textarea = question.querySelector('textarea');
    if (textarea && textarea.value.trim()) return textarea.value.trim();
    const textInput = question.querySelector('input:not([type="radio"]):not([type="checkbox"]):not([type="hidden"])');
    if (textInput && textInput.value) return textInput.value.trim();
    // 已批阅的作业详情页不会保留 radio/checkbox 的 checked 状态，而是把
    // “我的答案”放在 .mark_answer 或独立标签中；此时复用阅卷页解析。
    return extractMyAnswer(question, qtype);
  }

  function extractPracticeCorrectAnswer(question) {
    if (!question) return [];
    const answer = question.querySelector(
      '.correctAnswer, .correct-answer, .rightAnswer, .right-answer, [data-correct-answer]'
    );
    if (answer) {
      const content = stripAnswerLabel(extractRichContent(answer));
      if (hasRichContent(content)) return content;
    }
    const value = question.getAttribute('data-correct-answer') || question.getAttribute('correctAnswer');
    if (value) return [{ type: 'text', text: value }];
    // /work/view 已批阅页常被前面的“随堂练习”分支先识别到 .questionLi，
    // 但正确答案实际在 .mark_answer/.mark_key 或“正确答案：C”标签中。
    // 不能因为页面先命中练习结构就遗漏这部分阅卷信息。
    return extractCorrectAnswerContent(question);
  }

  function extractPracticeOption(option, index) {
    if (!option) return null;
    const explicitLetter = option.getAttribute('data-letter')
      || option.getAttribute('data-option')
      || option.getAttribute('data-value')
      || option.querySelector('.num_option, .option-letter, .optionLetter, .letter');
    const content = stripOptionPrefix(extractRichContent(option));
    let letter = content.letter;
    if (!letter) {
      const raw = typeof explicitLetter === 'string'
        ? explicitLetter
        : explicitLetter && explicitLetter.textContent;
      const match = String(raw || '').trim().match(/^([A-H])(?:[.、．)）])?$/i);
      if (match) letter = match[1].toUpperCase();
    }
    if (!letter) letter = String.fromCharCode(65 + index);
    const text = richTextOnly(content.content);
    if (!text && !hasRichContent(content.content)) return null;
    return { letter, text, content: content.content };
  }

  // 新版考试阅卷页（exam-ans ... reVersionPaperMarkContentNew）使用
  // .u-questionItem / .seeTitle / .titleBox .el-tag 结构。页面可能没有
  // 正确答案，但会明确显示本题分值与得分。
  function extractQuestionScoreInfo(questionEl, titleEl) {
    if (!questionEl) return { score: null, maxScore: null };
    const titleCandidates = [titleEl,
      questionEl.querySelector('.seeTitle, .Zy_TItle, .mark_name, .Py-m1-title, .question-title')
    ].filter(Boolean);
    const titleText = titleCandidates.map(el => (el.textContent || '').replace(/\s+/g, ' ').trim()).join(' ');
    let maxScore = null;
    const titleMatch = titleText.match(/[（(][^）)]*?(\d+(?:\.\d+)?)\s*分\s*[）)]/)
      || titleText.match(/(?:单选题|多选题|填空题|判断题|简答题|论述题|问答题)[^\d]{0,12}(\d+(?:\.\d+)?)\s*分/);
    if (titleMatch) maxScore = toScoreNumber(titleMatch[1]);

    const scoreSelectors = [
      '.titleBox .el-tag',
      '.mark_answer [class*="score"]', '.newAnswerBx [class*="score"]',
      '.myAnswerBx [class*="score"]', '.answerDet [class*="score"]',
      '.question-score', '.mark_score',
      '[data-score]'
    ];
    const seen = new Set();
    for (const selector of scoreSelectors) {
      for (const scoreEl of questionEl.querySelectorAll(selector)) {
        if (seen.has(scoreEl)) continue;
        seen.add(scoreEl);
        const rawScore = scoreEl.getAttribute('data-score') || scoreEl.getAttribute('score') || scoreEl.textContent;
        const score = toScoreNumber(rawScore);
        if (score !== null) return { score, maxScore };
      }
    }

    // 兼容没有语义 class 的旧版：分数通常是答案区里的最内层“1.0 分”。
    const answerArea = questionEl.querySelector('.mark_answer, .newAnswerBx, .answerDet, .answer-detail, .answerDetail');
    if (answerArea) {
      const leaf = Array.from(answerArea.querySelectorAll('*')).find(el => {
        if (el.children.length) return false;
        const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
        return /^(?:本题)?得分\s*[：:]?\s*\d+(?:\.\d+)?\s*分?$/.test(text)
          || /^\d+(?:\.\d+)?\s*分$/.test(text);
      });
      if (leaf) return { score: toScoreNumber(leaf.textContent), maxScore };
    }
    return { score: null, maxScore };
  }

  function applyQuestionScoreInfo(q, questionEl, titleEl) {
    if (!q) return q;
    const scoreInfo = extractQuestionScoreInfo(questionEl, titleEl);
    if (toScoreNumber(q.score) === null) q.score = scoreInfo.score;
    if (toScoreNumber(q.maxScore) === null) q.maxScore = scoreInfo.maxScore;
    return applyScoreDerivedAnswer(q);
  }

  function stripScoreReviewQuestionPrefix(content) {
    const parts = (content || []).map(part => part.type === 'text' ? { ...part } : part);
    for (const part of parts) {
      if (part.type !== 'text' || !part.text.trim()) continue;
      part.text = part.text
        .replace(/^\s*\d+\s*[.、]\s*/, '')
        .replace(/^\s*[（(]\s*(?:单选题|多选题|填空题|判断题|简答题|论述题|问答题|选择题)(?:\s*[,，]\s*\d+(?:\.\d+)?\s*分)?\s*[）)]\s*/, '');
      break;
    }
    return normalizeRichContent(parts);
  }

  function extractScoreReviewOptions(questionEl) {
    const selectors = [
      '.optionList .el-radio-group label', '.optionList .el-checkbox-group label',
      '.optionList label', '.option-list label'
    ];
    const seen = new Set();
    const options = [];
    selectors.forEach(selector => {
      questionEl.querySelectorAll(selector).forEach(node => {
        if (seen.has(node)) return;
        seen.add(node);
        const parsed = extractPracticeOption(node, options.length);
        if (parsed && /^[A-H]$/i.test(parsed.letter || '')) {
          parsed.letter = parsed.letter.toUpperCase();
          if (!options.some(option => option.letter === parsed.letter)) options.push(parsed);
        }
      });
    });
    return options.sort((a, b) => a.letter.localeCompare(b.letter));
  }

  function extractScoreReviewMyAnswer(questionEl, qtype, options) {
    const checked = [];
    questionEl.querySelectorAll('.optionList .is-checked, .option-list .is-checked, input[type="radio"]:checked, input[type="checkbox"]:checked').forEach(node => {
      const label = node.matches('label') ? node : (node.closest('label') || (node.parentElement && node.parentElement.closest('label')) || node);
      if (!label || checked.includes(label)) return;
      checked.push(label);
    });
    const letters = checked.map((label, index) => {
      const parsed = extractPracticeOption(label, index);
      if (parsed && /^[A-H]$/i.test(parsed.letter || '')) return parsed.letter.toUpperCase();
      const text = richTextOnly(extractRichContent(label));
      const option = (options || []).find(item => text.includes(item.text) || item.text.includes(text));
      return option ? option.letter : '';
    }).filter(Boolean);
    const selectedAnswer = [...new Set(letters)].join(qtype === '多选' ? ',' : '');
    if (selectedAnswer) return selectedAnswer;

    // 新版已批阅页面常把选项做成只读文本，已选状态不会保留在 radio/checkbox 上。
    // 此时直接读取“我的答案：C”，仍然只作为本题作答记录；是否正确由页面
    // 给出的答案或内部得分判断，不把分数展示到导出内容中。
    return richTextOnly(extractLabeledAnswerContent(questionEl, 'my'));
  }

  function extractScoreReviewCorrectAnswer(questionEl) {
    const direct = questionEl.querySelector('.answerDet .answer, .correctAnswer, .correct-answer, .rightAnswer, .right-answer, [data-correct-answer]');
    if (direct) {
      const content = stripAnswerLabel(extractRichContent(direct));
      if (hasRichContent(content)) return content;
    }
    return extractCorrectAnswerContent(questionEl);
  }

  function extractFromScoreReviewRoot(root) {
    const questionEls = Array.from(root.querySelectorAll('.u-questionItem')).filter(question =>
      question.querySelector('.seeTitle') || question.querySelector('.titleBox')
    );
    if (!questionEls.length) return null;

    const results = { '单选': [], '多选': [], '填空': [], '判断': [], '简答': [] };
    const typeOrder = [];
    let wrongCount = 0;
    let hasMyAnswer = false;
    let hasCorrectAnswer = false;

    questionEls.forEach((questionEl, index) => {
      const titleEl = questionEl.querySelector('.seeTitle, .question-title, .titleBox');
      if (!titleEl) return;
      const titleText = (titleEl.textContent || '').replace(/\s+/g, ' ').trim();
      const qtype = detectTypeFromText(titleText) || findQuestionType(questionEl, titleEl);
      if (!qtype || !results[qtype]) return;
      if (!typeOrder.includes(qtype)) typeOrder.push(qtype);

      const stemSource = titleEl.querySelector('.ql-editor') || titleEl;
      const stemContent = stripScoreReviewQuestionPrefix(stripQuestionPrefix(extractRichContent(stemSource)));
      if (!hasRichContent(stemContent)) return;

      const options = extractScoreReviewOptions(questionEl);
      const myAnswer = extractScoreReviewMyAnswer(questionEl, qtype, options);
      const correctAnswerContent = extractScoreReviewCorrectAnswer(questionEl);
      const correctAnswer = richTextOnly(correctAnswerContent);
      const numberMatch = titleText.match(/^\s*(\d{1,4})\s*[.、]/);
      const data = {
        qnum: numberMatch ? Number(numberMatch[1]) : index + 1,
        stem: formatRichForText(stemContent), stemContent, options,
        correctAnswer, correctAnswerContent, myAnswer,
        isWrong: false
      };
      applyQuestionScoreInfo(data, questionEl, titleEl);
      data.isWrong = isDataAnswerWrong(data, qtype);
      if (myAnswer) hasMyAnswer = true;
      if (hasRichContent(answerContent(data))) hasCorrectAnswer = true;
      if (data.isWrong) wrongCount++;
      results[qtype].push(data);
    });

    if (!hasQuestions({ results })) return null;
    return { results, typeOrder, wrongCount, hasMyAnswer, hasCorrectAnswer };
  }

  // 随堂练习 answerQuestion2 页面：题号、题型和题干在同一标题行，选项是普通 li。
  function extractFromQuizPracticeRoot(root) {
    const typePattern = /^(?:[［\[【(（].*(题)[］\]】)）]|(?:单选题|多选题|填空题|判断题|简答题|选择题))$/;
    const typePredicate = el => {
      const text = (el.textContent || '').trim();
      if (text.length > 20 || !detectTypeFromText(text) || !typePattern.test(text)) return false;
      // 只保留最内层文本节点，避免同一标签的祖先元素重复计数。
      return !Array.from(el.children || []).some(child => typePredicate(child));
    };
    const numberPredicate = el => /^\s*\d+\s*[.、)）]\s*$/.test((el.textContent || '').trim());
    const typeElements = Array.from(root.querySelectorAll('*')).filter(typePredicate);
    if (typeElements.length === 0) return null;

    const results = { '单选': [], '多选': [], '填空': [], '判断': [], '简答': [] };
    const typeOrder = [];
    let wrongCount = 0;
    let hasMyAnswer = false;
    let hasCorrectAnswer = false;
    const allElements = Array.from(root.querySelectorAll('*'));
    const allOptions = Array.from(root.querySelectorAll('li'));
    const elementIndex = new Map(allElements.map((el, index) => [el, index]));
    const submitBoundary = allElements.find(el => {
      const text = (el.textContent || '').trim();
      return text === '提交' && el.children.length <= 2;
    }) || null;
    const submitIndex = submitBoundary ? elementIndex.get(submitBoundary) : allElements.length;
    const isBetween = (index, start, end) => index > start && index < end;
    const isLeafText = el => {
      if (!el || el.closest('li')) return false;
      const text = (el.textContent || '').trim();
      if (!text || numberPredicate(el) || typePredicate(el)) return false;
      return el.children.length === 0 || Array.from(el.children).every(child => ['BR', 'IMG'].includes(child.tagName));
    };

    typeElements.forEach((typeEl, index) => {
      const typeIndex = elementIndex.get(typeEl);
      const nextType = typeElements[index + 1] || null;
      const nextTypeIndex = nextType ? elementIndex.get(nextType) : submitIndex;
      const sectionType = detectTypeFromText(typeEl.textContent || '');
      if (!sectionType) return;
      if (!typeOrder.includes(sectionType)) typeOrder.push(sectionType);

      // 题号是题型标签前最近的纯数字标题；优先从同一标题行的兄弟节点读取。
      const titleParent = typeEl.parentElement;
      const titleSiblings = titleParent ? Array.from(titleParent.children) : [];
      const siblingTypeIndex = titleSiblings.indexOf(typeEl);
      let numberEl = titleSiblings.slice(0, siblingTypeIndex).reverse().find(numberPredicate) || null;
      if (!numberEl) {
        numberEl = allElements.slice(0, allElements.indexOf(typeEl)).reverse().find(numberPredicate) || null;
      }

      const firstOption = allOptions.find(li => {
        const liIndex = elementIndex.get(li);
        return isBetween(liIndex, typeIndex, nextTypeIndex) && liIndex < submitIndex;
      });
      const firstOptionIndex = firstOption ? elementIndex.get(firstOption) : nextTypeIndex;
      let stemContent = [];
      try {
        // 题干容器有时同时包住选项，不能只筛“无子节点”的元素；
        // 用 Range 截取题型标签到第一项之间的内容，避免把选项文本带入题干。
        const rangeDocument = root.ownerDocument || root;
        const range = rangeDocument.createRange();
        range.setStartAfter(typeEl);
        if (firstOption) range.setEndBefore(firstOption);
        else if (nextType) range.setEndBefore(nextType);
        else range.setEndAfter(typeEl);
        stemContent = stripQuestionPrefix(extractRichContent(range.cloneContents()));
      } catch (e) {
        const stemEl = allElements.find(el => {
          const elIndex = elementIndex.get(el);
          return isBetween(elIndex, typeIndex, firstOptionIndex) && isLeafText(el);
        }) || null;
        stemContent = stemEl ? stripQuestionPrefix(extractRichContent(stemEl)) : [];
      }
      if (!hasRichContent(stemContent)) return;

      const options = [];
      allOptions.forEach((li, optionIndex) => {
        const liIndex = elementIndex.get(li);
        if (!isBetween(liIndex, typeIndex, nextTypeIndex) || liIndex >= submitIndex) return;
        const parsed = extractPracticeOption(li, optionIndex);
        if (parsed && /^[A-H]$/.test(parsed.letter)) options.push(parsed);
      });
      const uniqueOptions = Array.from(new Map(options.map(option => [option.letter, option])).values())
        .sort((a, b) => a.letter.localeCompare(b.letter));

      // 答案输入控件若存在，限定在当前题目区间内读取。
      const rangeElements = allElements.filter(el => {
        const elIndex = elementIndex.get(el);
        return isBetween(elIndex, typeIndex, nextTypeIndex) && elIndex < submitIndex;
      });
      const answerRoot = rangeElements[0] ? rangeElements[0].parentElement : titleParent;
      const myAnswer = extractPracticeMyAnswer(answerRoot, sectionType);
      const correctAnswerContent = extractPracticeCorrectAnswer(answerRoot);
      const correctAnswer = richContentToText(correctAnswerContent, () => '').replace(/\s+/g, ' ').trim();
      if (myAnswer) hasMyAnswer = true;
      const data = {
        qnum: numberEl ? parseInt((numberEl.textContent || '').match(/\d+/)?.[0] || '0', 10) : index + 1,
        stem: formatRichForText(stemContent), stemContent, options: uniqueOptions,
        correctAnswer, correctAnswerContent, myAnswer, isWrong: false
      };
      applyQuestionScoreInfo(data, answerRoot, titleParent || typeEl.parentElement);
      const wrong = isDataAnswerWrong(data, sectionType);
      data.isWrong = wrong;
      if (hasRichContent(answerContent(data))) hasCorrectAnswer = true;
      if (wrong) wrongCount++;
      results[sectionType].push(data);
    });

    const total = Object.values(results).reduce((sum, list) => sum + list.length, 0);
    if (total === 0) return null;
    return { results, typeOrder, wrongCount, hasMyAnswer, hasCorrectAnswer };
  }

  // 随堂练习的题目结构在不同课程中差异较大，统一从题目属性、题干和选项推断。
  function extractFromPracticeRoot(root) {
    const quizResult = extractFromQuizPracticeRoot(root);
    if (quizResult) return quizResult;
    const selectors = [
      '.questionLi', '.questionItem', '.question-item', '.exam-question',
      '.testQuestion', '.test-question', '.stuQuestion', '.question_box',
      '[data-question-id]', '[data-question-type]', '[data-questiontype]'
    ];
    const questions = [];
    const seen = new Set();
    selectors.forEach(selector => {
      root.querySelectorAll(selector).forEach(question => {
        if (seen.has(question)) return;
        const stemEl = findQuestionStemElement(question);
        const type = findQuestionType(question, stemEl);
        if (!stemEl || !type) return;
        seen.add(question);
        questions.push({ question, stemEl, type });
      });
    });
    if (questions.length === 0) return null;

    const results = { '单选': [], '多选': [], '填空': [], '判断': [], '简答': [] };
    const typeOrder = [];
    let wrongCount = 0;
    let hasMyAnswer = false;
    let hasCorrectAnswer = false;

    questions.forEach(({ question, stemEl, type }) => {
      const stemContent = stripQuestionPrefix(extractRichContent(stemEl));
      if (!hasRichContent(stemContent)) return;
      const stem = formatRichForText(stemContent);

      const optionSelectors = [
        '.answerBg', '.answer_bg', '.option', '.option-item', '.answerOption',
        '.answer-option', '.answer_box', '.answerBox', 'li[data-option]',
        'li[data-letter]', 'label.option', 'label.answer'
      ];
      const options = [];
      const optionSeen = new Set();
      optionSelectors.forEach(selector => {
        question.querySelectorAll(selector).forEach(option => {
          if (optionSeen.has(option)) return;
          optionSeen.add(option);
          const parsed = selector === '.answerBg'
            ? extractOptionFromAnswerBg(option, options.length)
            : extractPracticeOption(option, options.length);
          if (parsed) options.push(parsed);
        });
      });
      options.sort((a, b) => a.letter.localeCompare(b.letter));

      const myAnswer = extractPracticeMyAnswer(question, type);
      const correctAnswerContent = extractPracticeCorrectAnswer(question);
      const correctAnswer = richContentToText(correctAnswerContent, () => '').replace(/\s+/g, ' ').trim();
      if (myAnswer) hasMyAnswer = true;
      if (!typeOrder.includes(type)) typeOrder.push(type);

      const data = {
        qnum: extractQuestionNumber(question, stemEl),
        stem, stemContent, options,
        correctAnswer, correctAnswerContent,
        myAnswer, isWrong: false
      };
      applyQuestionScoreInfo(data, question, stemEl);
      const wrong = isDataAnswerWrong(data, type);
      data.isWrong = wrong;
      if (hasRichContent(answerContent(data))) hasCorrectAnswer = true;
      if (wrong) wrongCount++;
      results[type].push(data);
    });

    if (!hasQuestions({ results })) return null;
    return { results, typeOrder, wrongCount, hasMyAnswer, hasCorrectAnswer };
  }

  // 从章节测验/考试页面（.TiMu.newTiMu 结构）提取题目
  // 手机端 /work/phone/work 使用 .Py-mian1 结构，桌面选择器在这里完全不存在。
  // 只读题干、题型、选项和已显示答案，不触发提交或答题。
  function extractFromPhoneWorkRoot(root) {
    const questions = Array.from(root.querySelectorAll('.Py-mian1'));
    if (!questions.length) return null;
    // 使用题库内部统一的类型键（而不是页面显示的“单选题”等标签），
    // 否则批量结果合并时会被 QUESTION_BANK_TYPES 过滤掉。
    const typeMap = { '0': '单选', '1': '多选', '2': '填空', '3': '判断' };
    const results = { '单选': [], '多选': [], '填空': [], '判断': [], '简答': [] };
    const typeOrder = [];
    let wrongCount = 0;
    let hasMyAnswer = false;
    let hasCorrectAnswer = false;
    questions.forEach((question, index) => {
      const title = question.querySelector('.Py-m1-title, .Py-m1-title.fs16');
      if (!title) return;
      const inputs = Array.from(question.querySelectorAll('input[id*="answertype"], input[name*="answertype"]'));
      const typeValue = inputs.map(input => input.value || input.getAttribute('value')).find(value => typeMap[String(value)] !== undefined);
      const sectionType = typeMap[String(typeValue)] || detectTypeFromText(title.textContent || '');
      if (!sectionType || !results[sectionType]) return;
      if (!typeOrder.includes(sectionType)) typeOrder.push(sectionType);
      const stemContent = stripQuestionPrefix(extractRichContent(title));
      if (!hasRichContent(stemContent)) return;
      let options = [];
      if (sectionType === '单选' || sectionType === '多选') {
        options = Array.from(question.querySelectorAll('.answerList li')).map((li, optionIndex) => {
          const parsed = stripOptionPrefix(extractRichContent(li));
          const marker = li.querySelector('em[id-param], em[data-value], .num_option');
          const rawLetter = marker && (marker.getAttribute('id-param') || marker.getAttribute('data-value') || marker.textContent);
          const letterMatch = String(rawLetter || '').trim().match(/[A-H]/i) || String(parsed.letter || '').match(/[A-H]/i);
          const letter = letterMatch ? letterMatch[0].toUpperCase() : String.fromCharCode(65 + optionIndex);
          const text = richTextOnly(parsed.content);
          return text || hasRichContent(parsed.content) ? { letter, text, content: parsed.content } : null;
        }).filter(Boolean).filter((item, itemIndex, list) => list.findIndex(other => other.letter === item.letter) === itemIndex);
      } else if (sectionType === '判断题') {
        options = [{ letter: 'A', text: '对', content: [{ type: 'text', text: '对' }] }, { letter: 'B', text: '错', content: [{ type: 'text', text: '错' }] }];
      }
      const correctAnswerContent = extractCorrectAnswerContent(question);
      const correctAnswer = richTextOnly(correctAnswerContent);
      const myAnswer = extractPracticeMyAnswer(question, sectionType);
      if (myAnswer) hasMyAnswer = true;
      if (correctAnswer) hasCorrectAnswer = true;
      const numberMatch = (title.textContent || '').match(/(?:^|\s)(\d{1,4})\s*[.、．)]/);
      const data = {
        qnum: numberMatch ? Number(numberMatch[1]) : index + 1,
        stem: formatRichForText(stemContent), stemContent, options,
        correctAnswer, correctAnswerContent, myAnswer,
        isWrong: false
      };
      applyQuestionScoreInfo(data, question, title);
      data.isWrong = isDataAnswerWrong(data, sectionType);
      if (hasRichContent(answerContent(data))) hasCorrectAnswer = true;
      if (data.isWrong) wrongCount++;
      results[sectionType].push(data);
    });
    if (!hasQuestions({ results })) return null;
    return { results, typeOrder, wrongCount, hasMyAnswer, hasCorrectAnswer };
  }

  function extractFromTiMuRoot(root) {
    // 章节测验在不同版本中，题目容器可能是 #ZyBottom .aiArea，
    // 也可能直接以 .TiMu 挂在页面上。两种结构都作为候选。
    let areas = Array.from(root.querySelectorAll('#ZyBottom .aiArea, .aiArea'));
    if (areas.length === 0) {
      areas = Array.from(root.querySelectorAll('.TiMu.newTiMu, .TiMu'));
    }
    if (areas.length === 0) return null;

    const results = { '单选': [], '多选': [], '填空': [], '判断': [], '简答': [] };
    const typeOrder = [];
    let wrongCount = 0;
    let hasAnyMyAnswer = false;
    let hasCorrectAnswer = false;
    let currentType = null;

    // 提取章节测验页面中我的答案
    function extractMyAnswerTiMu(qDiv) {
      const myAnswerBx = qDiv.querySelector('.newAnswerBx .myAnswerBx');
      const con = myAnswerBx && myAnswerBx.querySelector('.myAnswer .answerCon');
      if (con && con.textContent.trim()) return con.textContent.trim();
      // /mooc-ans/mooc2/work/view 等作业详情页的答案位于 .mark_answer；
      // 页面同样可能带 .TiMu/.aiArea，不能因优先走本分支而漏掉它。
      return extractMyAnswer(qDiv, '');
    }

    // 提取章节测验页面中正确答案的富文本内容
    function extractCorrectAnswerContentTiMu(qDiv) {
      const correctBx = qDiv.querySelector('.newAnswerBx .correctAnswerBx');
      const con = correctBx && correctBx.querySelector('.correctAnswer .answerCon');
      if (con) {
        const content = stripAnswerLabel(extractRichContent(con));
        if (hasRichContent(content)) return content;
      }
      // 回退到作业详情的 .mark_answer/.mark_key/.colorGreen 结构。
      return extractCorrectAnswerContent(qDiv);
    }

    // 判断章节测验页面中是否答错
    function isAnswerWrongTiMu(qDiv, myAnswer, correctAnswer, qtype) {
      // 复用通用错题判断：同时支持 marking_dui/cuo 以及作业详情页的
      // icon-dui/cuo、rightIcon/wrongIcon 等状态图标，最后才比对答案。
      return isAnswerWrong(qDiv, myAnswer, correctAnswer, qtype);
    }

    const seenTiMu = new Set();
    areas.forEach(area => {
      // 题型标题通常位于 aiArea 内部或其前一个兄弟节点。
      const typeTit = area.querySelector('.newTestType')
        || (area.previousElementSibling && area.previousElementSibling.querySelector('.newTestType'));
      if (typeTit) {
        currentType = detectTypeFromText(typeTit.textContent || '');
        if (currentType && !typeOrder.includes(currentType)) typeOrder.push(currentType);
      }

      // 一个 aiArea 可能包含多道 .TiMu；旧逻辑只取第一道，导致章节题量偏少。
      const qDivs = area.matches('.TiMu.newTiMu, .TiMu')
        ? [area]
        : Array.from(area.querySelectorAll('.TiMu.newTiMu, .TiMu'));
      qDivs.forEach(qDiv => {
      if (!qDiv || seenTiMu.has(qDiv)) return;
      seenTiMu.add(qDiv);

      const titleDiv = qDiv.querySelector('.Zy_TItle');
      if (!titleDiv) return;

      const numEl = titleDiv.querySelector('i.fl');
      const qnum = numEl ? parseInt(numEl.textContent.trim(), 10) || 0 : 0;

      const qtContent = titleDiv.querySelector('.qtContent');
      if (!qtContent) return;
      const stemContent = stripQuestionPrefix(extractRichContent(qtContent));
      if (!hasRichContent(stemContent)) return;
      const stem = formatRichForText(stemContent);

      // 题型识别：优先使用最近遇到的题型标题，其次从题干标签识别
      let sectionType = currentType;
      if (!sectionType) {
        const typeLabel = qtContent.querySelector('.newZy_TItle');
        // 部分新版章节测验不再使用 .newZy_TItle，题型以“【单选题】”
        // 等文本直接写在题干中；此时从整个题干识别。
        sectionType = detectTypeFromText(`${typeLabel ? typeLabel.textContent : ''} ${qtContent.textContent || ''}`);
      }
      if (!sectionType) return;
      if (!typeOrder.includes(sectionType)) typeOrder.push(sectionType);

      // 已完成考试的新版阅卷页常为 .Zy_ulTop > li，旧版才带 qtDetail。
      // 不再只限定 qtDetail，否则题干正常但所有选择题选项会为空。
      const options = extractChoiceOptions(qDiv);

      const myAnswer = extractMyAnswerTiMu(qDiv);
      if (myAnswer) hasAnyMyAnswer = true;

      const correctAnswerContent = extractCorrectAnswerContentTiMu(qDiv);
      const correctAnswer = richContentToText(correctAnswerContent, () => '').replace(/\s+/g, ' ').trim();
      const data = {
        qnum, stem, stemContent, options,
        correctAnswer, correctAnswerContent,
        myAnswer, isWrong: false
      };
      applyQuestionScoreInfo(data, qDiv, titleDiv);
      const wrong = isAnswerWrongTiMu(qDiv, myAnswer, data.correctAnswer, sectionType)
        || isDataAnswerWrong(data, sectionType);
      data.isWrong = wrong;
      if (hasRichContent(answerContent(data))) hasCorrectAnswer = true;
      if (wrong) wrongCount++;

      results[sectionType].push(data);
      });
    });

    if (!hasQuestions({ results })) return null;
    const allQuestions = Object.values(results).flat();
    window.__xxt_exam_option_debug = {
      href: location.href,
      questionCount: allQuestions.length,
      choiceQuestionCount: allQuestions.filter(q => q.options && q.options.length).length,
      answerQuestionCount: allQuestions.filter(q => q.correctAnswer).length,
      wrongCount,
      emptyChoiceQuestions: allQuestions
        .filter(q => !q.options || !q.options.length)
        .filter(q => /单选|多选/.test(String(q.stem || '')))
        .slice(0, 20)
        .map(q => q.qnum || 0),
      answers: allQuestions.slice(0, 20).map(q => ({
        qnum: q.qnum || 0, myAnswer: q.myAnswer || '', correctAnswer: q.correctAnswer || '', isWrong: !!q.isWrong
      }))
    };
    return { results, typeOrder, wrongCount, hasMyAnswer: hasAnyMyAnswer, hasCorrectAnswer };
  }

  // 从指定文档/根节点提取题目（支持 .mark_item、.questionLi、.TiMu.newTiMu 三种结构，富文本版本）
  function extractFromRoot(root) {
    // 先识别新版考试阅卷页。它同样可能有通用题目 class，必须在
    // 通用练习分支之前读取单题得分，才能将 0 分题可靠归入错题。
    const scoreReviewResult = extractFromScoreReviewRoot(root);
    if (scoreReviewResult) return scoreReviewResult;

    const phoneWorkResult = extractFromPhoneWorkRoot(root);
    if (phoneWorkResult) return phoneWorkResult;
    // 优先章节测验/考试页面结构
    const tiMuResult = extractFromTiMuRoot(root);
    if (tiMuResult) return tiMuResult;

    // 与原脚本一致：已批阅作业页的 .mark_item 必须优先于通用
    // .questionLi/随堂练习分支。两者会同时出现，若先走练习分支就会
    // 只提取题目和选项、漏掉 .mark_answer 中的正确答案。
    const markItems = root.querySelectorAll('.mark_item');
    if (markItems.length === 0) {
      const practiceResult = extractFromPracticeRoot(root);
      if (practiceResult) return practiceResult;
    }

    const results = { '单选': [], '多选': [], '填空': [], '判断': [], '简答': [] };
    const typeOrder = [];

    // 优先 .mark_item 结构（带答案的作业详情页）
    if (markItems.length > 0) {
      let wrongCount = 0;
      let hasAnyMyAnswer = false;
      let hasCorrectAnswer = false;

      markItems.forEach(markItem => {
        const typeTit = markItem.querySelector('.type_tit');
        if (!typeTit) return;
        const sectionType = detectTypeFromText(typeTit.textContent || '');
        if (!sectionType) return;

        if (!typeOrder.includes(sectionType)) typeOrder.push(sectionType);

        const questionLis = markItem.querySelectorAll('.questionLi');
        questionLis.forEach(qLi => {
          const qtContent = qLi.querySelector('.qtContent');
          if (!qtContent) return;
          // 富文本提取题干
          const stemContent = stripQuestionPrefix(extractRichContent(qtContent));
          if (!hasRichContent(stemContent)) return;
          const stem = formatRichForText(stemContent);

          // 作业详情页不总是使用 .mark_letter；复用所有考试结构的选项选择器。
          const options = extractChoiceOptions(qLi);

          const correctAnswerContent = extractCorrectAnswerContent(qLi);
          const correctAnswer = richContentToText(correctAnswerContent, () => '').replace(/\s+/g, ' ').trim();
          const myAnswer = extractMyAnswer(qLi, sectionType);
          if (myAnswer) hasAnyMyAnswer = true;
          const data = {
            stem, stemContent,
            options, correctAnswer, correctAnswerContent,
            myAnswer, isWrong: false
          };
          applyQuestionScoreInfo(data, qLi, qtContent);
          const wrong = isAnswerWrong(qLi, myAnswer, data.correctAnswer, sectionType)
            || isDataAnswerWrong(data, sectionType);
          data.isWrong = wrong;
          if (hasRichContent(answerContent(data))) hasCorrectAnswer = true;
          if (wrong) wrongCount++;

          results[sectionType].push(data);
        });
      });

      return { results, typeOrder, wrongCount, hasMyAnswer: hasAnyMyAnswer, hasCorrectAnswer };
    }

    // 新版页面 .questionLi 结构（学习页面，通常无答案）
    const questionLis = root.querySelectorAll('.questionLi');
    if (questionLis.length > 0) {
      questionLis.forEach(qLi => {
        const stemEl = findQuestionStemElement(qLi);
        const typeName = `${questionAttributeText(qLi)} ${qLi.getAttribute('typeName') || ''}`;
        const sectionType = detectTypeFromText(typeName) || findQuestionType(qLi, stemEl);
        if (!sectionType) return;

        if (!typeOrder.includes(sectionType)) typeOrder.push(sectionType);

        const qData = extractFromQuestionLi(qLi, sectionType);
        if (qData) results[sectionType].push(qData);
      });

      return { results, typeOrder, wrongCount: 0, hasMyAnswer: false, hasCorrectAnswer: false };
    }

    return { results, typeOrder, wrongCount: 0, hasMyAnswer: false, hasCorrectAnswer: false };
  }

  // 从单个 .questionLi 提取题目（富文本版本）
  function extractFromQuestionLi(qLi, sectionType) {
    const markName = findQuestionStemElement(qLi);
    if (!markName) return null;
    const stemContent = stripQuestionPrefix(extractRichContent(markName));
    if (!hasRichContent(stemContent)) return null;
    const stem = formatRichForText(stemContent);

    const options = [];
    const optionSelectors = [
      '.answerBg', '.answer_bg', '.option', '.option-item', '.answerOption',
      '.answer-option', '.answer_box', '.answerBox', 'li[data-option]',
      'li[data-letter]', 'label.option', 'label.answer'
    ];
    const seenOptions = new Set();
    optionSelectors.forEach(selector => {
      qLi.querySelectorAll(selector).forEach((option, i) => {
        if (seenOptions.has(option)) return;
        seenOptions.add(option);
        const parsed = selector === '.answerBg'
          ? extractOptionFromAnswerBg(option, options.length)
          : extractPracticeOption(option, options.length);
        if (parsed) options.push(parsed);
      });
    });
    options.sort((a, b) => a.letter.localeCompare(b.letter));

    return {
      stem, stemContent, options,
      correctAnswer: '', correctAnswerContent: [],
      myAnswer: '', isWrong: false
    };
  }

  // 递归遍历所有 iframe（含嵌套 iframe）查找题目
  function extractFromIframesRecursive(root) {
    const iframes = root.querySelectorAll('iframe');
    for (const iframe of iframes) {
      let doc;
      try {
        doc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
      } catch (e) { continue; }
      if (!doc) continue;

      const result = extractFromRoot(doc);
      if (hasQuestions(result)) return result;

      const nested = extractFromIframesRecursive(doc);
      if (nested) return nested;
    }
    return null;
  }

  // ==================== TXT 格式化（富文本） ====================
  function formatOutput(results, typeOrder, withAnswers = false) {
    const typeLabels = {
      '单选': '单选题', '多选': '多选题', '填空': '填空题',
      '判断': '判断题', '简答': '简答题',
    };
    const typeNumbers = ['一', '二', '三', '四', '五', '六'];

    let output = '';
    let globalNum = 0;
    let sectionIdx = 0;

    for (const qtype of typeOrder) {
      const questions = results[qtype];
      if (!questions || questions.length === 0) continue;

      const label = typeLabels[qtype];
      const num = typeNumbers[sectionIdx] || sectionIdx + 1;
      output += `${num}. ${label}（共${questions.length}题）\n`;

      for (const q of questions) {
        globalNum++;
        output += `${globalNum}. ${formatRichForText(questionContent(q))}\n`;
        if (q.options && q.options.length > 0) {
          for (const opt of q.options) {
            output += `${opt.letter}. ${formatRichForText(optionContent(opt))}\n`;
          }
        }
        if (withAnswers) {
          const answer = formatRichForText(answerContent(q)) || unavailableCorrectAnswerText(q);
          output += `答案：${answer}\n`;
        }
        output += '\n';
      }
      sectionIdx++;
    }
    return output.trim();
  }

  function formatAnswersTXT(results, typeOrder) {
    const typeLabels = { '单选': '单选题', '多选': '多选题', '填空': '填空题', '判断': '判断题', '简答': '简答题' };
    const typeNumbers = ['一', '二', '三', '四', '五', '六'];

    let output = '';
    let globalNum = 0;
    let sectionIdx = 0;
    for (const qtype of typeOrder) {
      const questions = results[qtype];
      if (!questions || questions.length === 0) continue;

      const num = typeNumbers[sectionIdx] || sectionIdx + 1;
      output += `${num}、${typeLabels[qtype]}\n\n`;
      sectionIdx++;

      for (const q of questions) {
        globalNum++;
        const answer = formatRichForText(answerContent(q)) || unavailableCorrectAnswerText(q);
        if (qtype === '填空' && answer.includes('；')) {
          const parts = answer.split('；').map(p => p.trim().replace(/^\(\d+\)\s*/, ''));
          output += `${globalNum}. \n`;
          parts.forEach((part, i) => { output += `(${i + 1}) ${part}\n`; });
          output += '\n';
        } else {
          output += `${globalNum}. ${answer}\n\n`;
        }
      }
    }
    return output.trim();
  }

  function formatOutputWithAnswers(results, typeOrder) {
    return formatOutput(results, typeOrder, true);
  }

  function formatWrongQuestionsTXT(results, typeOrder) {
    let output = '';
    output += '\n\n\n';
    output += '========================================\n';
    output += '              错题汇总\n';
    output += '========================================\n\n';

    let globalNum = 0;
    for (const qtype of typeOrder) {
      const questions = results[qtype];
      if (!questions || questions.length === 0) continue;
      if (qtype === '简答') { globalNum += questions.length; continue; }
      for (const q of questions) {
        globalNum++;
        if (!q.isWrong) continue;
        const typeLabel = qtype === '填空' ? '填空题' : '题目';
        output += `${globalNum}. (${typeLabel})${formatRichForText(questionContent(q))}\n`;
        output += `   我的答案: ${q.myAnswer || '无'}\n`;
        output += `   正确答案: ${formatRichForText(answerContent(q)) || unavailableCorrectAnswerText(q)}\n\n`;
      }
    }
    return output.replace(/\n+$/, '');
  }

  // ==================== Markdown 格式化（富文本） ====================
  function formatOutputMD(results, typeOrder, withAnswers = false) {
    const typeLabels = {
      '单选': '单选题', '多选': '多选题', '填空': '填空题',
      '判断': '判断题', '简答': '简答题',
    };
    const typeNumbers = ['一', '二', '三', '四', '五', '六'];

    let output = '';
    let globalNum = 0;
    let sectionIdx = 0;

    for (const qtype of typeOrder) {
      const questions = results[qtype];
      if (!questions || questions.length === 0) continue;

      const label = typeLabels[qtype];
      const num = typeNumbers[sectionIdx] || sectionIdx + 1;
      output += `### ${num}、${label}（共${questions.length}题）\n\n`;

      for (const q of questions) {
        globalNum++;
        output += `**${globalNum}.** ${formatRichForMD(questionContent(q))}\n\n`;
        if (q.options && q.options.length > 0) {
          for (const opt of q.options) {
            output += `- ${opt.letter}. ${formatRichForMD(optionContent(opt))}\n`;
          }
          output += '\n';
        } else {
          output += '\n';
        }
        if (withAnswers) {
          const answer = formatRichForMD(answerContent(q)) || unavailableCorrectAnswerText(q);
          output += `> **答案：** ${answer}\n\n`;
        }
      }
      sectionIdx++;
    }
    return output.trim();
  }

  function formatAnswersMD(results, typeOrder) {
    let output = '';
    let globalNum = 0;
    for (const qtype of typeOrder) {
      const questions = results[qtype];
      if (!questions || questions.length === 0) continue;
      const typeLabels = { '单选': '单选题', '多选': '多选题', '填空': '填空题', '判断': '判断题', '简答': '简答题' };
      output += `**${typeLabels[qtype]}**\n\n`;
      for (const q of questions) {
        globalNum++;
        const answer = formatRichForMD(answerContent(q)) || unavailableCorrectAnswerText(q);
        if (qtype === '填空' && answer.includes('；')) {
          const parts = answer.split('；').map(p => p.trim().replace(/^\(\d+\)\s*/, ''));
          output += `${globalNum}.  \n`;
          parts.forEach((part, i) => { output += `    (${i + 1}) ${part}  \n`; });
          output += '\n';
        } else {
          output += `${globalNum}. ${answer}  \n`;
        }
      }
      output += '\n';
    }
    return output.trim();
  }

  function formatOutputWithAnswersMD(results, typeOrder) {
    return formatOutputMD(results, typeOrder, true);
  }

  function formatWrongQuestionsMD(results, typeOrder) {
    let output = '\n\n\n---\n\n';
    output += '## 错题汇总\n\n';

    let globalNum = 0;
    for (const qtype of typeOrder) {
      const questions = results[qtype];
      if (!questions || questions.length === 0) continue;
      if (qtype === '简答') { globalNum += questions.length; continue; }
      for (const q of questions) {
        globalNum++;
        if (!q.isWrong) continue;
        output += `**${globalNum}.** ${formatRichForMD(questionContent(q))}\n\n`;
        output += `- 我的答案: ${q.myAnswer || '无'}\n`;
        output += `- 正确答案: ${formatRichForMD(answerContent(q)) || unavailableCorrectAnswerText(q)}\n\n`;
      }
    }
    return output.replace(/\n+$/, '');
  }

  // ==================== PDF 文档生成（富文本） ====================
  function pdfEscape(text) {
    const div = document.createElement('div');
    div.textContent = String(text || '');
    return div.innerHTML.replace(/\n/g, '<br>');
  }

  function pdfRichHTML(content) {
    return (content || []).map(part => {
      if (part.type === 'text') return pdfEscape(part.text || '');
      if (part.type === 'break') return '<br>';
      if (part.type === 'image' && part.url) {
        return `<img src="${String(part.url).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}" crossorigin="anonymous" alt="题目图片">`;
      }
      return '';
    }).join('');
  }

  function buildPdfHTML(results, typeOrder, title, withAnswers, withWrong) {
    const typeHeaders = { '单选': '一、单项选择题', '多选': '二、多项选择题', '填空': '三、填空题', '判断': '四、判断题', '简答': '五、简答题' };
    let globalNum = 0;
    let html = `<div class="xxt-pdf-page"><h1>${pdfEscape(title || '学习通题目')}</h1>`;
    for (const qtype of typeOrder || []) {
      const questions = results[qtype] || [];
      if (!questions.length) continue;
      html += `<h2>${pdfEscape(typeHeaders[qtype] || qtype)}</h2>`;
      for (const q of questions) {
        globalNum++;
        html += `<div class="xxt-pdf-question"><div class="xxt-pdf-stem"><b>${globalNum}.</b> ${pdfRichHTML(questionContent(q))}</div>`;
        for (const opt of q.options || []) {
          html += `<div class="xxt-pdf-option">${pdfEscape(opt.letter || '')}. ${pdfRichHTML(optionContent(opt))}</div>`;
        }
        if (withAnswers) {
          const answer = answerContent(q);
          html += `<div class="xxt-pdf-answer"><b>答案：</b>${hasRichContent(answer) ? pdfRichHTML(answer) : pdfEscape(unavailableCorrectAnswerText(q))}</div>`;
        }
        html += '</div>';
      }
    }
    if (withWrong) {
      html += '<div class="xxt-pdf-divider"></div><h2>错题汇总</h2>';
      globalNum = 0;
      for (const qtype of typeOrder || []) {
        for (const q of results[qtype] || []) {
          globalNum++;
          if (!q.isWrong) continue;
          html += `<div class="xxt-pdf-question"><div class="xxt-pdf-stem"><b>${globalNum}.</b> ${pdfRichHTML(questionContent(q))}</div><div>我的答案：${pdfEscape(q.myAnswer || '无')}</div><div>正确答案：${pdfRichHTML(answerContent(q)) || pdfEscape(unavailableCorrectAnswerText(q))}</div></div>`;
        }
      }
    }
    html += '</div>';
    return html;
  }

  function bytesToBase64(bytes) {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

  function waitForPdfRenderFrame() {
    return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }

  function pdfCanvasHasContent(canvas) {
    if (!canvas || !canvas.width || !canvas.height) return false;
    // 只缩小检查少量像素，避免大题库导出时读取完整画布造成额外内存压力。
    const preview = document.createElement('canvas');
    preview.width = 160;
    preview.height = Math.max(1, Math.min(240, Math.round(canvas.height / canvas.width * preview.width)));
    const context = preview.getContext('2d', { willReadFrequently: true });
    context.fillStyle = '#fff';
    context.fillRect(0, 0, preview.width, preview.height);
    context.drawImage(canvas, 0, 0, preview.width, preview.height);
    const pixels = context.getImageData(0, 0, preview.width, preview.height).data;
    let visiblePixels = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      // 题干、标题、分隔线或图片中任意明显非白色像素均视为内容。
      if (pixels[i] < 238 || pixels[i + 1] < 238 || pixels[i + 2] < 238) {
        if (++visiblePixels >= 8) return true;
      }
    }
    return false;
  }

  async function generatePdf(results, typeOrder, title, withAnswers, withWrong, filename) {
    const pdfLib = window.html2pdf || (typeof html2pdf !== 'undefined' ? html2pdf : null);
    if (typeof pdfLib !== 'function') throw new Error('PDF 组件未加载，请刷新页面后重试');

    const holder = document.createElement('div');
    // 不能用 visibility:hidden、opacity:0 或移到视口外，否则 html2canvas 在部分
    // 学习通页面会只画出白色背景。放在当前可视区域且禁用鼠标事件，导出时仅会短暂闪过。
    holder.style.cssText = `position:absolute;left:0;top:${Math.max(0, window.scrollY || document.documentElement.scrollTop || 0)}px;width:794px;background:#fff;z-index:2147483647;pointer-events:none;`;
    const page = document.createElement('div');
    page.className = 'xxt-pdf-render-root';
    // 样式必须放进被 html2pdf 克隆的 page 内部；仅作为外层 holder 的兄弟节点时，
    // 个别页面的克隆文档会丢失这些规则，最终就会生成整本白页 PDF。
    page.innerHTML = `<style>
      .xxt-pdf-render-root{all:initial;box-sizing:border-box!important;display:block!important;width:794px!important;background:#fff!important;color:#111!important;-webkit-text-fill-color:#111!important;font-family:"Microsoft YaHei","Noto Sans CJK SC",Arial,sans-serif!important;font-size:14px!important;line-height:1.75!important;text-align:left!important;word-break:break-word!important}
      .xxt-pdf-page{box-sizing:border-box!important;display:block!important;width:794px!important;min-height:0!important;padding:42px 58px 48px!important;background:#fff!important;color:#111!important;-webkit-text-fill-color:#111!important;font-family:"Microsoft YaHei","Noto Sans CJK SC",Arial,sans-serif!important;font-size:14px!important;line-height:1.6!important;text-align:left!important;word-break:break-word!important}
      .xxt-pdf-render-root,.xxt-pdf-render-root *{box-sizing:border-box!important;visibility:visible!important;opacity:1!important;filter:none!important;text-shadow:none!important;transform:none!important;color:#111!important;-webkit-text-fill-color:#111!important;font-family:"Microsoft YaHei","Noto Sans CJK SC",Arial,sans-serif!important;letter-spacing:normal!important}
      .xxt-pdf-page div{display:block!important}.xxt-pdf-page b{font-weight:700!important}.xxt-pdf-page h1,.xxt-pdf-page h2{display:block!important;color:#111!important;-webkit-text-fill-color:#111!important}.xxt-pdf-page h1{text-align:center!important;font-size:23px!important;line-height:1.45!important;margin:0 0 28px!important;font-weight:700!important}.xxt-pdf-page h2{font-size:18px!important;line-height:1.45!important;margin:22px 0 12px!important;border-bottom:1px solid #bbb!important;padding-bottom:4px!important;font-weight:700!important}
      .xxt-pdf-question{margin:0 0 9px!important;break-inside:auto!important;page-break-inside:auto!important}.xxt-pdf-stem{font-size:15px!important;margin-bottom:3px!important}.xxt-pdf-option{padding-left:25px!important;line-height:1.5!important}.xxt-pdf-answer{margin-top:4px!important;color:#b42318!important;-webkit-text-fill-color:#b42318!important}.xxt-pdf-answer *{color:#b42318!important;-webkit-text-fill-color:#b42318!important}.xxt-pdf-divider{border-top:1px solid #999!important;margin:12px 0!important}
      .xxt-pdf-page img{display:block!important;visibility:visible!important;max-width:100%!important;max-height:360px!important;height:auto!important;margin:6px 0!important;object-fit:contain!important}
    </style>${buildPdfHTML(results, typeOrder, title, withAnswers, withWrong)}`;
    holder.appendChild(page);
    document.body.appendChild(holder);

    try {
      // 先把题目图片转成 data URL，避免 html2canvas 受跨域响应头影响而丢图。
      await Promise.all(Array.from(page.querySelectorAll('img')).map(async img => {
        const source = img.getAttribute('src');
        const asset = await fetchImageAsset(source);
        if (asset) {
          img.src = `data:image/${asset.type === 'jpg' ? 'jpeg' : asset.type};base64,${bytesToBase64(asset.data)}`;
        } else {
          // 跨域图片无法读取时移除 src，避免 html2canvas 因画布污染导致整个 PDF 失败。
          img.removeAttribute('src');
          img.alt = '图片加载失败';
        }
      }));
      await Promise.all(Array.from(page.querySelectorAll('img')).map(img => new Promise(resolve => {
        if (img.complete) return resolve();
        img.onload = img.onerror = resolve;
      })));
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      await waitForPdfRenderFrame();

      const worker = pdfLib().set({
        margin: 0, filename: filename || '学习通题目.pdf', image: { type: 'jpeg', quality: 0.96 },
        html2canvas: {
          scale: 2, useCORS: true, allowTaint: false, backgroundColor: '#fff', logging: false,
          onclone: clonedDocument => {
            const clonedPage = clonedDocument.querySelector('.xxt-pdf-page');
            if (clonedPage) {
              clonedPage.style.display = 'block';
              clonedPage.style.visibility = 'visible';
              clonedPage.style.opacity = '1';
              clonedPage.style.color = '#111';
              clonedPage.style.webkitTextFillColor = '#111';
            }
          }
        },
        jsPDF: { unit: 'pt', format: 'a4', orientation: 'portrait' },
        // legacy 模式会被学习通页面的分页样式干扰，曾导致生成数十页白页。
        // 只让浏览器自然流式分页；逐题 avoid-all 会在每页底部留下大块空白。
        pagebreak: { mode: ['css'] }
      }).from(page);
      await worker.toCanvas();
      const canvas = await worker.get('canvas');
      const sourceText = (page.innerText || '').replace(/\s+/g, ' ').trim();
      window.__xxt_pdf_debug = {
        sourceTextLength: sourceText.length,
        sourceWidth: Math.round(page.getBoundingClientRect().width),
        sourceHeight: Math.round(page.getBoundingClientRect().height),
        canvasWidth: canvas && canvas.width || 0,
        canvasHeight: canvas && canvas.height || 0,
        hasContent: pdfCanvasHasContent(canvas)
      };
      if (!sourceText || !window.__xxt_pdf_debug.hasContent) {
        throw new Error('页面渲染为空，已阻止下载空白 PDF。请刷新学习通页面后重试；若仍失败，请将 window.__xxt_pdf_debug 的内容反馈给我');
      }
      await worker.toPdf().save();
    } finally {
      holder.remove();
    }
  }

  // ==================== Word 文档生成（富文本） ====================
  // 同一张题目图片可能在题干、选项和答案中重复出现；缓存 Promise，
  // 避免 Word 导出逐个重复请求导致“生成中”长时间不结束。
  const imageAssetCache = new Map();
  async function fetchImageAsset(url) {
    if (!url) return null;
    const cacheKey = String(url);
    if (imageAssetCache.has(cacheKey)) return imageAssetCache.get(cacheKey);
    const pending = fetchImageAssetUncached(cacheKey);
    imageAssetCache.set(cacheKey, pending);
    return pending;
  }

  async function fetchImageAssetUncached(url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    try {
      const resp = await fetch(url, { mode: 'cors', signal: controller.signal });
      if (!resp.ok) return null;
      const blob = await resp.blob();
      if (!blob.type.startsWith('image/')) return null;

      const objectUrl = URL.createObjectURL(blob);
      const size = await new Promise((resolve) => {
        const img = new Image();
        let finished = false;
        let decodeTimer = null;
        const done = (value) => {
          if (finished) return;
          finished = true;
          if (decodeTimer) clearTimeout(decodeTimer);
          URL.revokeObjectURL(objectUrl);
          resolve(value);
        };
        // 某些损坏或特殊编码图片会让 Image 既不触发 load 也不触发 error；
        // 不能让一张图片无限阻塞整个原生 DOCX 导出。
        decodeTimer = setTimeout(() => done({ width: 300, height: 200 }), 5000);
        img.onload = () => done({ width: img.naturalWidth || 300, height: img.naturalHeight || 200 });
        img.onerror = () => done({ width: 300, height: 200 });
        img.src = objectUrl;
      });
      const typeMap = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/gif': 'gif', 'image/bmp': 'bmp' };
      const type = typeMap[blob.type];
      if (!type) return null;
      const data = new Uint8Array(await blob.arrayBuffer());
      return { data, type, width: size.width, height: size.height };
    } catch (e) {
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function buildImageRun(url) {
    if (!url) return null;
    const base64 = await fetchImageAsset(url);
    if (base64) {
      // 使用图片真实格式与原始宽高比，按页宽上限等比缩放，避免 JPEG 被声明为 PNG、长图被压扁
      const MAX_WIDTH = 560;
      const MAX_HEIGHT = 420;
      const ratio = Math.min(1, MAX_WIDTH / base64.width, MAX_HEIGHT / base64.height);
      return new docx.ImageRun({
        data: base64.data,
        transformation: {
          width: Math.max(1, Math.round(base64.width * ratio)),
          height: Math.max(1, Math.round(base64.height * ratio))
        },
        type: base64.type
      });
    }
    // 图片加载失败，记录计数
    window.__xxt_failed_image_count = (window.__xxt_failed_image_count || 0) + 1;
    return null;
  }

  // Word/WPS 对中文段落中的“分散对齐”非常敏感：题目页面的选项
  // 常把每个汉字放在相邻 span 中，提取后会出现“中 国 特 色”这种
  // 仅存在于 HTML 排版中的空格。导出 Word 前去掉汉字之间的排版空格。
  function normalizeWordText(text) {
    return String(text || '')
      .replace(/\n+/g, ' ')
      .replace(/([\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff])(?:[ \t\u00a0\u3000]+)(?=[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff])/g, '$1');
  }

  async function buildRichRuns(content, prefix = '') {
    const { TextRun } = docx;
    const runs = [];
    if (prefix) runs.push(new TextRun({ text: prefix, font: "宋体", size: 24, characterSpacing: 0 }));
    for (const part of content || []) {
      if (part.type === 'text') {
        const normalized = normalizeWordText(part.text);
        if (normalized) runs.push(new TextRun({ text: normalized, font: "宋体", size: 24, characterSpacing: 0 }));
      } else if (part.type === 'image') {
        if (runs.length > 0) runs.push(new TextRun({ text: ' ', font: "宋体", size: 24 }));
        const imgRun = await buildImageRun(part.url);
        if (imgRun) runs.push(imgRun);
        runs.push(new TextRun({ text: ' ', font: "宋体", size: 24 }));
      } else if (part.type === 'break') {
        runs.push(new TextRun({ text: '\n', break: 1, font: "宋体", size: 24 }));
      }
    }
    return runs.length ? runs : [new TextRun({ text: prefix, font: "宋体", size: 24, characterSpacing: 0 })];
  }

  // 将富文本内容构建为带段后间距的 Paragraph 数组（Word 导出用）
  async function buildRichParagraphs(content, prefix = '', spacing = 0) {
    const { Paragraph } = docx;
    const runs = await buildRichRuns(content, prefix);
    return [new Paragraph({
      children: runs,
      alignment: docx.AlignmentType.LEFT,
      spacing: { after: spacing }
    })];
  }

  // 获取题目的规范化富文本题干（Word 导出判断题等场景使用）
  function normalizedQuestionContent(q) {
    return questionContent(q);
  }

  const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  // `docx` 的 Packer 在部分 ScriptCat 注入环境里会停在 JSZip 的异步打包阶段。
  // 这里直接写入 Office Open XML + 无压缩 ZIP；生成的仍是标准 .docx，且不再依赖
  // Packer/JSZip 的运行时实现。ZIP 的「仅存储」模式是 DOCX 规范允许的格式，Word/WPS
  // 都可以直接打开。
  const nativeDocxEncoder = new TextEncoder();
  const nativeDocxCrcTable = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let value = i;
      for (let bit = 0; bit < 8; bit++) value = (value & 1) ? (0xEDB88320 ^ (value >>> 1)) : (value >>> 1);
      table[i] = value >>> 0;
    }
    return table;
  })();

  function nativeDocxBytes(value) {
    return nativeDocxEncoder.encode(String(value));
  }

  function nativeDocxConcat(parts) {
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const output = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
      output.set(part, offset);
      offset += part.length;
    }
    return output;
  }

  function nativeDocxU16(bytes, offset, value) {
    bytes[offset] = value & 0xFF;
    bytes[offset + 1] = (value >>> 8) & 0xFF;
  }

  function nativeDocxU32(bytes, offset, value) {
    bytes[offset] = value & 0xFF;
    bytes[offset + 1] = (value >>> 8) & 0xFF;
    bytes[offset + 2] = (value >>> 16) & 0xFF;
    bytes[offset + 3] = (value >>> 24) & 0xFF;
  }

  function nativeDocxCrc32(bytes) {
    let value = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) value = nativeDocxCrcTable[(value ^ bytes[i]) & 0xFF] ^ (value >>> 8);
    return (value ^ 0xFFFFFFFF) >>> 0;
  }

  function nativeDocxZip(entries) {
    const localParts = [];
    const centralParts = [];
    let localOffset = 0;
    let centralSize = 0;

    for (const entry of entries) {
      const name = nativeDocxBytes(entry.name);
      const data = entry.data instanceof Uint8Array ? entry.data : new Uint8Array(entry.data);
      const crc = nativeDocxCrc32(data);

      const local = new Uint8Array(30 + name.length);
      nativeDocxU32(local, 0, 0x04034B50);
      nativeDocxU16(local, 4, 20);
      nativeDocxU16(local, 6, 0x0800); // UTF-8 文件名
      nativeDocxU16(local, 8, 0); // store（不压缩）
      nativeDocxU16(local, 10, 0);
      nativeDocxU16(local, 12, 0);
      nativeDocxU32(local, 14, crc);
      nativeDocxU32(local, 18, data.length);
      nativeDocxU32(local, 22, data.length);
      nativeDocxU16(local, 26, name.length);
      nativeDocxU16(local, 28, 0);
      local.set(name, 30);
      localParts.push(local, data);

      const central = new Uint8Array(46 + name.length);
      nativeDocxU32(central, 0, 0x02014B50);
      nativeDocxU16(central, 4, 20);
      nativeDocxU16(central, 6, 20);
      nativeDocxU16(central, 8, 0x0800);
      nativeDocxU16(central, 10, 0);
      nativeDocxU16(central, 12, 0);
      nativeDocxU16(central, 14, 0);
      nativeDocxU32(central, 16, crc);
      nativeDocxU32(central, 20, data.length);
      nativeDocxU32(central, 24, data.length);
      nativeDocxU16(central, 28, name.length);
      nativeDocxU16(central, 30, 0);
      nativeDocxU16(central, 32, 0);
      nativeDocxU16(central, 34, 0);
      nativeDocxU16(central, 36, 0);
      nativeDocxU32(central, 38, 0);
      nativeDocxU32(central, 42, localOffset);
      central.set(name, 46);
      centralParts.push(central);

      localOffset += local.length + data.length;
      centralSize += central.length;
    }

    const end = new Uint8Array(22);
    nativeDocxU32(end, 0, 0x06054B50);
    nativeDocxU16(end, 4, 0);
    nativeDocxU16(end, 6, 0);
    nativeDocxU16(end, 8, entries.length);
    nativeDocxU16(end, 10, entries.length);
    nativeDocxU32(end, 12, centralSize);
    nativeDocxU32(end, 16, localOffset);
    nativeDocxU16(end, 20, 0);
    return nativeDocxConcat([...localParts, ...centralParts, end]);
  }

  function nativeDocxEscape(value) {
    return String(value == null ? '' : value)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function nativeDocxRunProperties(options = {}) {
    const font = nativeDocxEscape(options.font || '宋体');
    const size = Math.max(2, Number(options.size) || 24);
    let properties = `<w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:eastAsia="${font}" w:cs="${font}"/>`;
    if (options.bold) properties += '<w:b/><w:bCs/>';
    if (options.color) properties += `<w:color w:val="${nativeDocxEscape(options.color)}"/>`;
    properties += `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr>`;
    return properties;
  }

  function nativeDocxTextRun(text, options = {}) {
    const source = String(text == null ? '' : text).replace(/\r\n?/g, '\n');
    const fragments = source.split(/(\t|\n)/);
    let body = '';
    for (const fragment of fragments) {
      if (!fragment) continue;
      if (fragment === '\t') body += '<w:tab/>';
      else if (fragment === '\n') body += '<w:br/>';
      else body += `<w:t xml:space="preserve">${nativeDocxEscape(fragment)}</w:t>`;
    }
    if (!body) body = '<w:t/>';
    return `<w:r>${nativeDocxRunProperties(options)}${body}</w:r>`;
  }

  function nativeDocxTabRun() {
    return '<w:r><w:tab/></w:r>';
  }

  function nativeDocxBreakRun(type) {
    return `<w:r><w:br${type ? ` w:type="${type}"` : ''}/></w:r>`;
  }

  function nativeDocxParagraph(runs, options = {}) {
    const properties = [];
    if (options.alignment) properties.push(`<w:jc w:val="${options.alignment}"/>`);
    if (typeof options.after === 'number') properties.push(`<w:spacing w:after="${Math.max(0, Math.round(options.after))}" w:afterAutospacing="0"/>`);
    if (typeof options.leftIndent === 'number') properties.push(`<w:ind w:left="${Math.max(0, Math.round(options.leftIndent))}"/>`);
    if (options.tabStop) properties.push(`<w:tabs><w:tab w:val="left" w:pos="${Math.round(options.tabStop)}"/></w:tabs>`);
    const pPr = properties.length ? `<w:pPr>${properties.join('')}</w:pPr>` : '';
    const body = runs && runs.length ? runs.join('') : '<w:r/>';
    return `<w:p>${pPr}${body}</w:p>`;
  }

  function nativeDocxImageRun(media, drawingId) {
    const width = Math.max(1, Math.round(media.width || 300));
    const height = Math.max(1, Math.round(media.height || 200));
    const cx = width * 9525;
    const cy = height * 9525;
    const name = nativeDocxEscape(`图片 ${drawingId}`);
    return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${drawingId}" name="${name}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${media.relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr bwMode="auto"><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
  }

  async function generateNativeDocxBlob(results, typeOrder, title, withAnswers, withWrong, bankImport, markStage) {
    const stage = (name, extra = {}) => {
      if (typeof markStage === 'function') markStage(name, extra);
    };
    const typeHeaders = {
      '单选': '一、单项选择题', '多选': '二、多项选择题',
      '填空': '三、填空题', '判断': '四、判断题',
      '简答': '五、简答题',
    };
    const bankTypeLabels = {
      '单选': '【单选题】', '多选': '【多选题】', '填空': '【填空题】',
      '判断': '【判断题】', '简答': '【简答题】',
    };
    const imageUrls = new Set();
    let questionCount = 0;
    const collectImages = content => (content || []).forEach(part => {
      if (part && part.type === 'image' && part.url) imageUrls.add(String(part.url));
    });
    for (const qtype of typeOrder || []) {
      for (const question of results[qtype] || []) {
        questionCount++;
        collectImages(questionContent(question));
        (question.options || []).forEach(option => collectImages(optionContent(option)));
        if (withAnswers || withWrong || bankImport) collectImages(answerContent(question));
      }
    }

    const media = [];
    const mediaByUrl = new Map();
    let nextMediaId = 1;
    const getMedia = async url => {
      if (!url) return null;
      const key = String(url);
      if (mediaByUrl.has(key)) return mediaByUrl.get(key);
      const id = nextMediaId++;
      const pending = (async () => {
        const asset = await fetchImageAsset(key);
        if (!asset || !asset.data || !asset.type) return null;
        const type = asset.type === 'jpeg' ? 'jpg' : asset.type;
        const extension = ({ png: 'png', jpg: 'jpg', gif: 'gif', bmp: 'bmp' })[type];
        if (!extension) return null;
        const rawWidth = Math.max(1, Number(asset.width) || 300);
        const rawHeight = Math.max(1, Number(asset.height) || 200);
        const ratio = Math.min(1, 560 / rawWidth, 420 / rawHeight);
        const item = {
          id,
          relId: `rId${id + 1}`,
          fileName: `image${id}.${extension}`,
          extension,
          data: asset.data,
          width: Math.max(1, Math.round(rawWidth * ratio)),
          height: Math.max(1, Math.round(rawHeight * ratio)),
        };
        media.push(item);
        return item;
      })();
      mediaByUrl.set(key, pending);
      return pending;
    };

    try {
      stage('预热图片', { questionCount, imageCount: imageUrls.size });
      await Promise.all(Array.from(imageUrls, getMedia));
      stage('构建原生 DOCX', { questionCount, imageCount: imageUrls.size, mediaCount: media.length });

      let drawingId = 1;
      const richRuns = async (content, prefix = '', options = {}) => {
        const runs = [];
        if (prefix) runs.push(nativeDocxTextRun(prefix, options));
        for (const part of content || []) {
          if (!part) continue;
          if (part.type === 'text') {
            const text = normalizeWordText(part.text);
            if (text) runs.push(nativeDocxTextRun(text, options));
          } else if (part.type === 'image') {
            if (runs.length) runs.push(nativeDocxTextRun(' ', options));
            const item = await getMedia(part.url);
            if (item) runs.push(nativeDocxImageRun(item, drawingId++));
            runs.push(nativeDocxTextRun(' ', options));
          } else if (part.type === 'break') {
            runs.push(nativeDocxBreakRun());
          }
        }
        return runs.length ? runs : [nativeDocxTextRun(prefix, options)];
      };
      const hasContent = content => hasRichContent(content);
      const children = [];

      if (bankImport) {
        children.push(nativeDocxParagraph([
          nativeDocxTextRun(title || '题库导入', { size: 32, bold: true, color: '000000' })
        ], { alignment: 'center', after: 240 }));
        let questionNumber = 0;
        for (const qtype of typeOrder || []) {
          const questions = results[qtype] || [];
          const label = bankTypeLabels[qtype] || `【${qtype}】`;
          for (const question of questions) {
            questionNumber++;
            const stem = formatRichForText(questionContent(question))
              .replace(/\(\s{2,}\)/g, '（ ）')
              .replace(/（\s{2,}）/g, '（ ）');
            children.push(nativeDocxParagraph([
              nativeDocxTextRun(`${questionNumber}.${label}${stem}`, { size: 24 })
            ], { after: 40 }));
            for (const part of questionContent(question)) {
              if (part && part.type === 'image') {
                const item = await getMedia(part.url);
                if (item) children.push(nativeDocxParagraph([nativeDocxImageRun(item, drawingId++)], { after: 80 }));
              }
            }
            for (const option of question.options || []) {
              children.push(nativeDocxParagraph(
                await richRuns(optionContent(option), `${option.letter || ''}. `, { size: 24 }),
                { after: 40 }
              ));
            }
            const answerRich = answerContent(question);
            const answer = formatRichForText(answerRich).trim();
            if (answer || hasContent(answerRich)) {
              let answerParts = hasContent(answerRich) ? answerRich : [{ type: 'text', text: answer }];
              if (!hasContent(answerRich) && qtype === '多选') {
                answerParts = [{ type: 'text', text: answer.replace(/\s+/g, '').split('').join('，') }];
              } else if (!hasContent(answerRich) && qtype === '判断') {
                answerParts = [{ type: 'text', text: /^(√|✓|T|True|TRUE|对|正确)/.test(answer) ? '对' : '错' }];
              }
              children.push(nativeDocxParagraph(await richRuns(answerParts, '答案：', { size: 24 }), { after: 120 }));
            } else {
              children.push(nativeDocxParagraph([], { after: 120 }));
            }
          }
        }
      } else {
        children.push(nativeDocxParagraph([
          nativeDocxTextRun(title || '试卷', { size: 32, bold: true, color: '000000' })
        ], { alignment: 'center', after: 240 }));
        let questionNumber = 0;
        for (const qtype of typeOrder || []) {
          const questions = results[qtype] || [];
          if (!questions.length) continue;
          children.push(nativeDocxParagraph([
            nativeDocxTextRun(`${typeHeaders[qtype] || qtype}（本大题共${questions.length}小题）`, { size: 28, bold: true, color: '000000' })
          ], { after: 120 }));
          for (const question of questions) {
            questionNumber++;
            const stem = questionContent(question);
            if (qtype === '单选' || qtype === '多选') {
              children.push(nativeDocxParagraph(await richRuns(stem, `${questionNumber}. `, { size: 24 }), { after: 40 }));
              const options = question.options || [];
              if (options.length) {
                // 与 PDF 一致：每个选项单独一行并向内缩进；不再将短选项硬拼成左右两列，
                // 避免在 Word/WPS 中出现截图里那种过宽、错行的选项布局。
                for (const option of options) {
                  children.push(nativeDocxParagraph(
                    await richRuns(optionContent(option), `${option.letter || ''}. `, { size: 24 }),
                    { after: 40, leftIndent: 500 }
                  ));
                }
                if (!withAnswers) children.push(nativeDocxParagraph([], { after: 80 }));
              }
            } else if (qtype === '判断') {
              const runs = await richRuns(stem, `${questionNumber}. `, { size: 24 });
              runs.push(nativeDocxTextRun('（  ）', { size: 24 }));
              children.push(nativeDocxParagraph(runs, { after: withAnswers ? 40 : 120 }));
            } else if (qtype === '简答') {
              children.push(nativeDocxParagraph(await richRuns(stem, `${questionNumber}. `, { size: 24 }), { after: 40 }));
              if (!withAnswers) {
                for (let line = 0; line < 8; line++) children.push(nativeDocxParagraph([], { after: 40 }));
                children.push(nativeDocxParagraph([], { after: 80 }));
              }
            } else {
              children.push(nativeDocxParagraph(await richRuns(stem, `${questionNumber}. `, { size: 24 }), { after: withAnswers ? 40 : 120 }));
            }

            // “附加答案”应紧跟在这一题的选项（或题干）后，不能单独汇总到文末；
            // 这样每题、每个选项与它自己的答案始终位于同一段落组中。
            if (withAnswers) {
              const answerRich = answerContent(question);
              const answerRuns = hasContent(answerRich)
                ? await richRuns(answerRich, '', { size: 24, color: '16A34A' })
                : [nativeDocxTextRun(unavailableCorrectAnswerText(question), { size: 24, color: '16A34A' })];
              const answerIndent = (qtype === '单选' || qtype === '多选') ? 500 : 0;
              children.push(nativeDocxParagraph([
                nativeDocxTextRun('答案：', { size: 24, bold: true, color: '16A34A' }),
                ...answerRuns
              ], { after: 120, leftIndent: answerIndent }));
            }
          }
        }

        if (withWrong) {
          let hasWrong = false;
          for (const qtype of typeOrder || []) {
            if ((results[qtype] || []).some(question => question.isWrong)) { hasWrong = true; break; }
          }
          if (hasWrong) {
            children.push(nativeDocxParagraph([nativeDocxBreakRun('page')], { after: 0 }));
            children.push(nativeDocxParagraph([
              nativeDocxTextRun('错题汇总', { size: 32, bold: true, color: '000000' })
            ], { alignment: 'center', after: 240 }));
            let globalNumber = 0;
            for (const qtype of typeOrder || []) {
              const questions = results[qtype] || [];
              if (!questions.length) continue;
              const wrongQuestions = questions.filter(question => question.isWrong);
              if (!wrongQuestions.length) {
                globalNumber += questions.length;
                continue;
              }
              children.push(nativeDocxParagraph([
                nativeDocxTextRun(typeHeaders[qtype] || qtype, { size: 28, bold: true, color: '000000' })
              ], { after: 120 }));
              for (const question of questions) {
                globalNumber++;
                if (!question.isWrong) continue;
                children.push(nativeDocxParagraph(await richRuns(questionContent(question), `${globalNumber}. `, { size: 24 }), { after: 40 }));
                for (const option of question.options || []) {
                  children.push(nativeDocxParagraph(await richRuns(optionContent(option), `${option.letter || ''}. `, { size: 24 }), { after: 40 }));
                }
                children.push(nativeDocxParagraph([
                  nativeDocxTextRun(`我的答案: ${question.myAnswer || '无'}`, { size: 24, color: 'DC2626' })
                ], { after: 40 }));
                const answerRich = answerContent(question);
                const answerRuns = hasContent(answerRich)
                  ? await richRuns(answerRich, '', { size: 24, color: '16A34A' })
                  : [nativeDocxTextRun(unavailableCorrectAnswerText(question), { size: 24, color: '16A34A' })];
                children.push(nativeDocxParagraph([
                  nativeDocxTextRun('正确答案: ', { size: 24, color: '16A34A' }), ...answerRuns
                ], { after: 120 }));
              }
            }
          }
        }
      }

      const margin = bankImport ? { top: 1134, bottom: 1134, left: 1417, right: 1417 } : { top: 1417, bottom: 1417, left: 1417, right: 1417 };
      const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${children.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="${margin.top}" w:right="${margin.right}" w:bottom="${margin.bottom}" w:left="${margin.left}" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
      const now = new Date().toISOString();
      const contentTypes = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">', '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>', '<Default Extension="xml" ContentType="application/xml"/>'];
      for (const extension of new Set(media.map(item => item.extension))) {
        const mime = ({ png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp' })[extension];
        if (mime) contentTypes.push(`<Default Extension="${extension}" ContentType="${mime}"/>`);
      }
      contentTypes.push('<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>', '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>', '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>', '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>', '</Types>');
      const documentRelationships = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">', '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'];
      for (const item of media) documentRelationships.push(`<Relationship Id="${item.relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${item.fileName}"/>`);
      documentRelationships.push('</Relationships>');

      stage('写入标准 DOCX 包', { questionCount, imageCount: imageUrls.size, mediaCount: media.length });
      const entries = [
        { name: '[Content_Types].xml', data: nativeDocxBytes(contentTypes.join('')) },
        { name: '_rels/.rels', data: nativeDocxBytes('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>') },
        { name: 'docProps/core.xml', data: nativeDocxBytes(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${nativeDocxEscape(title || '学习通题目')}</dc:title><dc:creator>学习通题目导出</dc:creator><cp:lastModifiedBy>学习通题目导出</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`) },
        { name: 'docProps/app.xml', data: nativeDocxBytes('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>学习通题目导出</Application></Properties>') },
        { name: 'word/document.xml', data: nativeDocxBytes(documentXml) },
        { name: 'word/styles.xml', data: nativeDocxBytes('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="宋体" w:hAnsi="宋体" w:eastAsia="宋体"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="zh-CN" w:eastAsia="zh-CN"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>') },
        { name: 'word/_rels/document.xml.rels', data: nativeDocxBytes(documentRelationships.join('')) },
        ...media.map(item => ({ name: `word/media/${item.fileName}`, data: item.data }))
      ];
      const blob = new Blob([nativeDocxZip(entries)], { type: DOCX_MIME });
      if (!blob.size || blob.size < 100) throw new Error('DOCX 打包结果无效');
      stage('完成', { questionCount, imageCount: imageUrls.size, mediaCount: media.length, bytes: blob.size });
      return blob;
    } catch (error) {
      stage('失败', {
        questionCount,
        imageCount: imageUrls.size,
        error: error && error.message ? error.message : String(error)
      });
      throw error;
    }
  }

  // docx 的 Packer.toBase64String 与 toBlob 使用同一套 OOXML/XML/ZIP 打包逻辑，
  // 只是最后一步的输出格式不同。学习通的 ScriptCat 注入环境中 toBlob 曾出现
  // Promise 长期不结算；这里把 Base64 分块还原成浏览器原生 Blob，得到的仍是真正
  // 的 .docx（ZIP / Office Open XML），而不是 HTML 兼容文件。
  function base64ToDocxBlob(base64) {
    if (typeof base64 !== 'string' || !base64) throw new Error('DOCX 打包结果为空');
    const chunks = [];
    // 必须按 4 的倍数切分，避免把 Base64 的一个编码单元截断。
    const chunkChars = 4 * 16384;
    for (let offset = 0; offset < base64.length; offset += chunkChars) {
      const binary = atob(base64.slice(offset, offset + chunkChars));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      chunks.push(bytes);
    }
    return new Blob(chunks, { type: DOCX_MIME });
  }

  async function generateWordBlob(results, typeOrder, title, withAnswers, withWrong, bankImport) {
    const startedAt = Date.now();
    let currentStage = '准备文档';
    const markStage = (stage, extra = {}) => {
      currentStage = stage;
      window.__xxt_word_export_debug = {
        stage,
        startedAt,
        elapsedMs: Date.now() - startedAt,
        ...extra
      };
    };

    // 原脚本使用 Packer.toBlob(doc)。当前 ScriptCat 注入环境中该 Packer 会卡住，
    // 因此改由上方的标准 OOXML 写入器直接生成同样的原生 .docx 文件。
    return await generateNativeDocxBlob(results, typeOrder, title, withAnswers, withWrong, bankImport, markStage);

    // 保留旧的 docx 组装代码作为版式参考；正常流程不会再触及 Packer/JSZip。
    const { Document, Packer, Paragraph, TextRun, ImageRun,
            AlignmentType, convertMillimetersToTwip,
            TabStopType, PageBreak } = docx;

    // 先并行预热本次文档需要的图片；后续 buildImageRun 都命中缓存，
    // 不会按“题干→选项→答案”逐张串行等待网络。
    const imageUrls = new Set();
    let questionCount = 0;
    const collectImages = content => (content || []).forEach(part => {
      if (part && part.type === 'image' && part.url) imageUrls.add(String(part.url));
    });
    for (const qtype of typeOrder || []) {
      for (const q of results[qtype] || []) {
        questionCount++;
        collectImages(questionContent(q));
        (q.options || []).forEach(option => collectImages(optionContent(option)));
        if (withAnswers || withWrong || bankImport) collectImages(answerContent(q));
      }
    }
    markStage('预热图片', { questionCount, imageCount: imageUrls.size });
    if (imageUrls.size) await Promise.all(Array.from(imageUrls, url => fetchImageAsset(url)));

    const packDocument = async doc => {
      let timer = null;
      const timeout = new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Word 文档生成超时（' + currentStage + '），请重试；若仍出现，请反馈 window.__xxt_word_export_debug')), 90000);
      });
      // 先让浏览器绘制按钮状态，再开始原生 OOXML 打包。
      await new Promise(resolve => setTimeout(resolve, 0));
      const useBase64 = typeof Packer.toBase64String === 'function';
      const packing = Promise.resolve().then(() => {
        markStage(useBase64 ? '打包原生 DOCX' : '打包原生 DOCX（兼容输出）', { questionCount, imageCount: imageUrls.size });
        return useBase64 ? Packer.toBase64String(doc) : Packer.toBlob(doc);
      });
      try {
        const packed = await Promise.race([packing, timeout]);
        markStage('生成下载文件', { questionCount, imageCount: imageUrls.size });
        const blob = useBase64 ? base64ToDocxBlob(packed) : packed;
        if (!(blob instanceof Blob) || blob.size < 100) throw new Error('DOCX 打包结果无效');
        markStage('完成', { questionCount, imageCount: imageUrls.size, bytes: blob.size });
        return blob;
      } catch (error) {
        markStage('失败', {
          questionCount,
          imageCount: imageUrls.size,
          error: error && error.message ? error.message : String(error)
        });
        throw error;
      } finally {
        if (timer) clearTimeout(timer);
      }
    };

    const typeHeaders = {
      '单选': '一、单项选择题', '多选': '二、多项选择题',
      '填空': '三、填空题', '判断': '四、判断题',
      '简答': '五、简答题',
    };

    const bankTypeLabels = {
      '单选': '【单选题】', '多选': '【多选题】', '填空': '【填空题】',
      '判断': '【判断题】', '简答': '【简答题】',
    };

    // 题库导入格式：生成学习通智能导入兼容的 Word 文档
    if (bankImport) {
      const children = [];
      children.push(new Paragraph({
        children: [new TextRun({ text: title || '题库导入', font: "宋体", size: 32, bold: true, color: "000000" })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 240 }
      }));

      let qNum = 0;

      for (const qtype of typeOrder) {
        const questions = results[qtype];
        if (!questions || questions.length === 0) continue;

        const prefix = bankTypeLabels[qtype];

        for (const q of questions) {
          qNum++;
          // 题干（题号 + 题型标签 + 题干内容），括号归一化
          const stemText = formatRichForText(questionContent(q));
          const stem = prefix + stemText.replace(/\(\s{2,}\)/g, '（ ）').replace(/（\s{2,}）/g, '（ ）');
          children.push(new Paragraph({
            children: [new TextRun({ text: `${qNum}.${stem}`, font: "宋体", size: 24 })],
            spacing: { after: 40 }
          }));
          // 题干中的图片
          const stemContent = questionContent(q);
          for (const part of stemContent) {
            if (part.type === 'image') {
              const imgRun = await buildImageRun(part.url);
              if (imgRun) {
                children.push(new Paragraph({
                  children: [imgRun],
                  spacing: { after: 80 }
                }));
              }
            }
          }

          // 选项
          const options = q.options || [];
          for (const opt of options) {
            const runs = await buildRichRuns(optionContent(opt), `${opt.letter}. `);
            children.push(new Paragraph({
              children: runs,
              alignment: AlignmentType.LEFT,
              spacing: { after: 40 }
            }));
          }

          // 答案
          const answerRich = answerContent(q);
          const answer = formatRichForText(answerRich).trim();
          if (answer) {
            // 答案含图片时原样保留富文本；否则按题型归一化（多选中文逗号分隔、判断对/错）
            const answerHasRich = hasRichContent(answerRich);
            let formattedAnswerParts = answerHasRich
              ? answerRich
              : [{ type: 'text', text: answer }];
            if (qtype === '多选' && !answerHasRich) {
              const parts = answer.replace(/\s+/g, '').split('');
              formattedAnswerParts = [{ type: 'text', text: parts.join('，') }];
            } else if (qtype === '判断' && !answerHasRich) {
              // 仅按答案开头判断，避免"不正确"被误判为对
              if (/^(√|✓|对|正确|T|True|TRUE)/.test(answer.trim())) {
                formattedAnswerParts = [{ type: 'text', text: '对' }];
              } else {
                formattedAnswerParts = [{ type: 'text', text: '错' }];
              }
            }
            children.push(...await buildRichParagraphs(formattedAnswerParts, '答案：', 120));
          } else {
            children.push(...await buildRichParagraphs(
              [{ type: 'text', text: unavailableCorrectAnswerText(q) }],
              '答案：',
              120
            ));
          }
        }
      }

      const doc = new Document({
        sections: [{
          properties: {
            page: {
              margin: {
                top: convertMillimetersToTwip(20),
                bottom: convertMillimetersToTwip(20),
                left: convertMillimetersToTwip(25),
                right: convertMillimetersToTwip(25)
              }
            }
          },
          children
        }]
      });

      return await packDocument(doc);
    }

    const children = [];

    // 标题
    children.push(new Paragraph({
      children: [new TextRun({ text: title || '试卷', font: "宋体", size: 32, bold: true, color: "000000" })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 }
    }));

    let qNum = 0;

    for (const qtype of typeOrder) {
      const questions = results[qtype];
      if (!questions || questions.length === 0) continue;

      const header = typeHeaders[qtype] || qtype;
      const count = questions.length;

      children.push(new Paragraph({
        children: [new TextRun({ text: `${header}（本大题共${count}小题）`, font: "宋体", size: 28, bold: true, color: "000000" })],
        spacing: { after: 120 }
      }));

      for (const q of questions) {
        qNum++;
        const stemContent = questionContent(q);

        if (qtype === '单选' || qtype === '多选') {
          children.push(new Paragraph({
            children: await buildRichRuns(stemContent, `${qNum}. `),
            spacing: { after: 40 }
          }));
          const options = q.options || [];
          if (options.length > 0) {
            const maxLen = Math.max(...options.map(o => (o.text || '').length));
            const useVertical = maxLen > 25;

            if (useVertical) {
              for (const opt of options) {
                children.push(new Paragraph({
                  children: await buildRichRuns(optionContent(opt), `${opt.letter}. `),
                  spacing: { after: 40 }
                }));
              }
            } else {
              for (let i = 0; i < options.length; i += 2) {
                const left = options[i];
                const right = options[i + 1];
                const leftRuns = await buildRichRuns(optionContent(left), `${left.letter}. `);
                if (right) {
                  const rightRuns = await buildRichRuns(optionContent(right), `${right.letter}. `);
                  const tabRun = new TextRun({ text: '\t', font: "宋体", size: 24 });
                  children.push(new Paragraph({
                    children: [...leftRuns, tabRun, ...rightRuns],
                    tabStops: [{ type: TabStopType.LEFT, position: 4500 }],
                    spacing: { after: 40 }
                  }));
                } else {
                  children.push(new Paragraph({
                    children: leftRuns,
                    spacing: { after: 40 }
                  }));
                }
              }
            }
            children.push(new Paragraph({ children: [], spacing: { after: 80 } }));
          }
        } else if (qtype === '填空') {
          children.push(new Paragraph({
            children: await buildRichRuns(stemContent, `${qNum}. `),
            spacing: { after: 40 }
          }));
          children.push(new Paragraph({ children: [], spacing: { after: 120 } }));
        } else if (qtype === '判断') {
          // 输出题干，题干末尾追加判断括号，避免重复输出
          const judgeRuns = await buildRichRuns(stemContent, `${qNum}. `);
          judgeRuns.push(new TextRun({ text: '（  ）', font: "宋体", size: 24 }));
          children.push(new Paragraph({
            children: judgeRuns,
            spacing: { after: 120 }
          }));
        } else if (qtype === '简答') {
          children.push(new Paragraph({
            children: await buildRichRuns(stemContent, `${qNum}. `),
            spacing: { after: 40 }
          }));
          for (let i = 0; i < 8; i++) {
            children.push(new Paragraph({
              children: [new TextRun({ text: '', font: "宋体", size: 24 })],
              spacing: { after: 40 }
            }));
          }
          children.push(new Paragraph({ children: [], spacing: { after: 80 } }));
        }
      }
    }

    // 答案页
    if (withAnswers) {
      children.push(new Paragraph({
        children: [new PageBreak()],
        spacing: { after: 0 }
      }));
      children.push(new Paragraph({
        children: [new TextRun({ text: '参考答案', font: "宋体", size: 32, bold: true, color: "000000" })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 240 }
      }));
      let aNum = 0;
      for (const qtype of typeOrder) {
        const questions = results[qtype];
        if (!questions || questions.length === 0) continue;
        const header = typeHeaders[qtype] || qtype;
        children.push(new Paragraph({
          children: [new TextRun({ text: header, font: "宋体", size: 28, bold: true, color: "000000" })],
          spacing: { after: 120 }
        }));
        for (const q of questions) {
          aNum++;
          const answerRich = answerContent(q);
          const answerRuns = await buildRichRuns(answerRich);
          if (answerRuns.length === 0) {
            answerRuns.push(new TextRun({ text: unavailableCorrectAnswerText(q), font: "宋体", size: 24 }));
          }
          children.push(new Paragraph({
            children: [new TextRun({ text: `${aNum}. `, font: "宋体", size: 24 }), ...answerRuns],
            spacing: { after: 60 }
          }));
        }
      }
    }

    // 错题汇总（Word 试卷）
    if (withWrong) {
      let hasWrong = false;
      for (const qtype of typeOrder) {
        const questions = results[qtype];
        if (!questions) continue;
        for (const q of questions) {
          if (q.isWrong) { hasWrong = true; break; }
        }
        if (hasWrong) break;
      }

      if (hasWrong) {
        children.push(new Paragraph({
          children: [new PageBreak()],
          spacing: { after: 0 }
        }));
        children.push(new Paragraph({
          children: [new TextRun({ text: '错题汇总', font: "宋体", size: 32, bold: true, color: "000000" })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 240 }
        }));

        let globalNum = 0;
        for (const qtype of typeOrder) {
          const questions = results[qtype];
          if (!questions || questions.length === 0) continue;
          if (qtype === '简答') { globalNum += questions.length; continue; }

          const header = typeHeaders[qtype] || qtype;
          let sectionHasWrong = false;
          for (const q of questions) {
            if (q.isWrong) { sectionHasWrong = true; break; }
          }
          if (!sectionHasWrong) { globalNum += questions.length; continue; }

          children.push(new Paragraph({
            children: [new TextRun({ text: header, font: "宋体", size: 28, bold: true, color: "000000" })],
            spacing: { after: 120 }
          }));

          for (const q of questions) {
            globalNum++;
            if (!q.isWrong) continue;
            children.push(new Paragraph({
              children: await buildRichRuns(questionContent(q), `${globalNum}. `),
              spacing: { after: 40 }
            }));
            const options = q.options || [];
            if (options.length > 0) {
              for (const opt of options) {
                children.push(new Paragraph({
                  children: await buildRichRuns(optionContent(opt), `${opt.letter}. `),
                  spacing: { after: 40 }
                }));
              }
            }
            children.push(new Paragraph({
              children: [new TextRun({ text: `我的答案: ${q.myAnswer || '无'}`, font: "宋体", size: 24, color: "DC2626" })],
              spacing: { after: 40 }
            }));
            const correctRuns = await buildRichRuns(answerContent(q));
            if (correctRuns.length === 0) {
              correctRuns.push(new TextRun({ text: unavailableCorrectAnswerText(q), font: "宋体", size: 24, color: "16A34A" }));
            }
            children.push(new Paragraph({
              children: [new TextRun({ text: '正确答案: ', font: "宋体", size: 24, color: "16A34A" }), ...correctRuns],
              spacing: { after: 120 }
            }));
          }
        }
      }
    }

    const doc = new Document({
      sections: [{
        properties: {
          page: {
            margin: {
              top: convertMillimetersToTwip(25),
              bottom: convertMillimetersToTwip(25),
              left: convertMillimetersToTwip(25),
              right: convertMillimetersToTwip(25)
            }
          }
        },
        children
      }]
    });

    return await packDocument(doc);
  }

  // ==================== UI 创建 ====================
  let extractedData = null;
  // null 代表“全部题目”；Set 则保存用户在编辑器中勾选、用于导出/复制/存题库的题目。
  // 选择范围仅作用于当前面板数据，不会删除未勾选题目。
  let selectedExportQuestionKeys = null;

  function exportQuestionKey(type, question) {
    return bankQuestionIdentity(type, question);
  }

  function resetExportQuestionSelection() {
    selectedExportQuestionKeys = null;
  }

  function getSelectedQuestionCount(data = extractedData) {
    if (!data || !data.results) return 0;
    if (selectedExportQuestionKeys === null) return Object.values(data.results).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0);
    let count = 0;
    (data.typeOrder || Object.keys(data.results)).forEach(type => {
      (data.results[type] || []).forEach(question => {
        if (selectedExportQuestionKeys.has(exportQuestionKey(type, question))) count++;
      });
    });
    return count;
  }

  function getSelectedExtractedData(data = extractedData) {
    if (!data || !data.results || selectedExportQuestionKeys === null) return data;
    const results = Object.fromEntries(QUESTION_BANK_TYPES.map(type => [type,
      (data.results[type] || []).filter(question => selectedExportQuestionKeys.has(exportQuestionKey(type, question)))
    ]));
    const typeOrder = (data.typeOrder || QUESTION_BANK_TYPES).filter(type => results[type] && results[type].length);
    return createExtractedDataFromResults(results, typeOrder, data.title);
  }

  function updateExportSelectionSummary() {
    const summary = document.getElementById('xxt-selection-summary');
    if (!summary || !extractedData) return;
    const selected = getSelectedQuestionCount(extractedData);
    const total = extractedData.total || 0;
    summary.textContent = selected === total ? `导出范围：全部 ${total} 题` : `导出范围：已选 ${selected} / ${total} 题`;
    summary.classList.toggle('xxt-selection-limited', selected !== total);
  }
  // createPanel 会被 MutationObserver 重复调用；共享控制器管理只注册一次的全局 UI 事件
  const uiEventController = new AbortController();

  let _creatingPanel = false;
  // 顶层的任务切换监听器也需要知道批量流程是否正在运行。不能把状态只
  // 声明在 createPanel 内，否则外层监听器会在页面切换时抛 ReferenceError。
  let batchExtractionRun = null;

  function createPanel() {
    if (_creatingPanel) return;
    if (document.getElementById('xxt-panel')) return;

    _creatingPanel = true;
    if (observer) { observer.disconnect(); observer = null; }

    const panel = document.createElement('div');
    panel.id = 'xxt-panel';
    panel.innerHTML = `
      <div class="xxt-header">
        <h3>学习通题目一键提取导出</h3>
        <div style="display:flex;align-items:center;gap:4px;">
          <a class="xxt-feedback-link" id="xxt-feedbackLink"
             href="https://qm.qq.com/cgi-bin/qm/qr?k=576pg6G95bKB3A1nGXaUo3pY_xYdeBEW&amp;jump_from=webapi&amp;authKey=VEDKaRZobYLzHSWu87P/RqGVH6E7FiPrCfcNpkBURCDt3TbVCWJ8mUZ3yh3obWIa"
             target="_blank" rel="noopener noreferrer" title="加入 QQ 群反馈问题">QQ群反馈</a>
          <button class="xxt-settings-btn" id="xxt-historyBtn" title="历史记录">
            <svg viewBox="0 0 24 24"><path d="M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg>
          </button>
          <button class="xxt-settings-btn" id="xxt-settingsBtn" title="设置">
            <svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
          </button>
        </div>
      </div>
      <button id="xxt-bankBtn" class="xxt-bank-entry" type="button" title="打开题库区">
        <span class="xxt-bank-entry-icon" aria-hidden="true">📚</span>
        <span class="xxt-bank-entry-copy"><strong>题库区</strong><small>管理、保存和导出题目</small></span>
        <span class="xxt-bank-entry-arrow" aria-hidden="true">›</span>
      </button>
      <section class="xxt-tiku-promo" aria-label="星夜题库资源入口">
        <div class="xxt-tiku-promo-top">
          <span class="xxt-tiku-promo-icon" aria-hidden="true">✦</span>
          <span class="xxt-tiku-promo-copy"><strong>星夜题库 · 千万免费题库</strong><small>支持 OCS 网课助手接入与配置</small></span>
        </div>
        <div class="xxt-tiku-promo-actions">
          <a class="xxt-tiku-promo-link" href="https://tiku888.top/" target="_blank" rel="noopener noreferrer" title="在新标签页打开星夜题库">进入题库 ↗</a>
          <a class="xxt-tiku-promo-link" href="https://tiku888.top/guide" target="_blank" rel="noopener noreferrer" title="查看 OCS 网课助手接入说明">OCS 接入说明 ↗</a>
        </div>
      </section>
      <div class="xxt-primary-actions">
        <button id="xxt-btnExtract" class="xxt-btn xxt-btn-extract">提取本页</button>
        <button id="xxt-btnBatchExtract" class="xxt-btn-batch" type="button" title="选择课程任务点后，自动提取整门课章节测验">整门课提取</button>
      </div>
      <section id="xxt-batch-live" class="xxt-batch-live xxt-hidden" aria-live="polite">
        <div class="xxt-batch-live-head"><strong class="xxt-batch-live-title">整门课提取进度</strong><span class="xxt-batch-live-state" data-batch-live-state>准备中</span></div>
        <div class="xxt-batch-live-current" data-batch-live-current></div>
        <div class="xxt-batch-live-detail" data-batch-live-detail></div>
        <div class="xxt-batch-live-bar"><i data-batch-live-bar></i></div>
        <div class="xxt-batch-live-actions">
          <button type="button" class="xxt-hidden" data-batch-live-resume>继续提取</button>
          <button type="button" class="xxt-hidden" data-batch-live-restart>重新开始</button>
          <button type="button" class="xxt-hidden" data-batch-live-stop>暂停提取</button>
        </div>
        <details class="xxt-batch-live-log">
          <summary>运行日志（<span data-batch-live-log-count>0</span>）</summary>
          <div class="xxt-batch-live-log-list" data-batch-live-log></div>
        </details>
      </section>
      <div id="xxt-status" class="xxt-hidden"></div>
      <div id="xxt-result" class="xxt-hidden">
        <div id="xxt-stat" class="xxt-stat"></div>
        <div class="xxt-result-actions" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
          <button type="button" id="xxt-btnEdit" class="xxt-btn xxt-btn-outline" style="width:100%;padding:10px;border-radius:12px;font-weight:700;cursor:pointer;pointer-events:auto;">查看、编辑 / 选择题目</button>
          <button type="button" id="xxt-btnSaveToBank" class="xxt-btn xxt-btn-outline" style="width:100%;padding:10px;border-radius:12px;font-weight:700;cursor:pointer;pointer-events:auto;">存入题库</button>
        </div>
        <div id="xxt-selection-summary" class="xxt-selection-summary"></div>
        <details class="xxt-export-settings">
          <summary><span>导出设置</span><small>格式、答案与顺序</small></summary>
          <div class="xxt-export-settings-body">
            <div class="xxt-section">
              <input type="text" id="xxt-filename" class="xxt-filename xxt-hidden" placeholder="文件名（默认自动生成）">
              <div class="xxt-format-row">
                <span>输出格式</span>
                <label><input type="radio" name="xxt-fmt" value="word" checked> Word 试卷</label>
                <label><input type="radio" name="xxt-fmt" value="txt"> TXT</label>
                <label><input type="radio" name="xxt-fmt" value="md"> MD</label>
                <label><input type="radio" name="xxt-fmt" value="pdf"> PDF</label>
              </div>
            </div>
            <label class="xxt-toggle" id="xxt-ans-toggle">
              <input type="checkbox" id="xxt-chkAnswers">
              <div class="xxt-checkbox-wrap"></div>
              <span>附加答案</span>
            </label>
            <label class="xxt-toggle xxt-hidden" id="xxt-wrong-toggle">
              <input type="checkbox" id="xxt-chkWrong">
              <div class="xxt-checkbox-wrap"></div>
              <span>附加错题</span>
            </label>
            <label class="xxt-toggle" id="xxt-shuffle-toggle">
              <input type="checkbox" id="xxt-chkShuffle">
              <div class="xxt-checkbox-wrap"></div>
              <span>题目乱序</span>
            </label>
            <label class="xxt-toggle" id="xxt-bank-import-toggle">
              <input type="checkbox" id="xxt-chkBankImport">
              <div class="xxt-checkbox-wrap"></div>
              <span>题库导入格式（学习通智能导入兼容）</span>
            </label>
            <div id="xxt-wrong-hint" class="xxt-wrong-hint xxt-hidden"></div>
          </div>
        </details>
        <div class="xxt-actions">
          <button id="xxt-btnPreview" class="xxt-btn xxt-btn-outline">👁 预览</button>
          <button id="xxt-btnDownload" class="xxt-btn xxt-btn-outline">&#8681; 下载</button>
          <button id="xxt-btnCopy" class="xxt-btn xxt-btn-outline">&#128203; 复制文本</button>
        </div>
      </div>
    `;
    document.body.appendChild(panel);

    const $ = (id) => document.getElementById(id);
    const els = {
      panel,
      btnExtract: $('xxt-btnExtract'),
      btnBatchExtract: $('xxt-btnBatchExtract'),
      batchLive: $('xxt-batch-live'),
      bankBtn: $('xxt-bankBtn'),
      btnSaveToBank: $('xxt-btnSaveToBank'),
      status: $('xxt-status'),
      result: $('xxt-result'),
      stat: $('xxt-stat'),
      btnEdit: $('xxt-btnEdit'),
      filename: $('xxt-filename'),
      btnPreview: $('xxt-btnPreview'),
      btnDownload: $('xxt-btnDownload'),
      btnCopy: $('xxt-btnCopy'),
      chkAnswers: $('xxt-chkAnswers'),
      chkWrong: $('xxt-chkWrong'),
      wrongToggle: $('xxt-wrong-toggle'),
      wrongHint: $('xxt-wrong-hint'),
      chkShuffle: $('xxt-chkShuffle'),
      chkBankImport: $('xxt-chkBankImport'),
      bankImportToggle: $('xxt-bank-import-toggle'),
    };

    // 任务/随堂练习切换后清除旧的提取结果。学习通通常只替换 iframe，
    // 顶层 URL 不变，因此仅依赖 location.href 无法判断页面已经切换。
    // 每次切换/提取都递增此序号，废弃上一轮仍在等待的异步提取，
    // 避免旧请求在新页面加载过程中弹出“未检测到题目”。
    let extractionGeneration = 0;
    const resetExtractedView = () => {
      extractionGeneration++;
      // 切换后的 iframe 通常还需要几秒才会完成渲染；在这段时间内保持“加载中”，
      // 不要把暂时没有题目的中间状态显示成识别失败。题目仍由用户点击主按钮后提取。
      const previousSignature = extractedData
        ? iframeDataSignature(extractedData)
        : iframeDataSignature(window.__xxt_iframe_data);
      // 同一次切换会同时触发“任务点击”和 iframe load；第二次重置时
      // extractedData 已为空，不能把第一次记录的旧题目签名覆盖为空。
      if (previousSignature) window.__xxt_ignore_iframe_signature = previousSignature;
      extractedData = null;
      resetExportQuestionSelection();
      window.__xxt_iframe_data = null;
      window.__xxt_iframe_context = null;
      window.__xxt_navigation_started_at = Date.now();
      els.result.classList.add('xxt-hidden');
      showStatus(els, '正在等待新练习加载…', 'loading');
      els.btnExtract.disabled = !!(batchExtractionRun && batchExtractionRun.running);
      els.btnExtract.textContent = '提取本页题目';
      if (els.chkAnswers) { els.chkAnswers.checked = false; els.chkAnswers.disabled = false; }
      if (els.chkWrong) els.chkWrong.checked = false;
      if (els.chkShuffle) els.chkShuffle.checked = false;
      if (els.wrongToggle) els.wrongToggle.classList.add('xxt-hidden');
      if (els.wrongHint) els.wrongHint.classList.add('xxt-hidden');
    };
    window.__xxt_reset_extraction = resetExtractedView;

    // 恢复上次的导出配置
    const cfg = currentSettings.exportConfig;
    if (cfg) {
      const fmtRadio = document.querySelector(`input[name="xxt-fmt"][value="${cfg.format}"]`);
      if (fmtRadio) fmtRadio.checked = true;
      if (els.chkAnswers) { els.chkAnswers.checked = cfg.withAnswers; }
      if (els.chkShuffle) { els.chkShuffle.checked = cfg.shuffle; }
      if (els.chkBankImport) { els.chkBankImport.checked = cfg.format === 'word' && !!cfg.bankImport; }
      // 题库导入格式选项仅在 Word 格式下显示。
      if (els.bankImportToggle) els.bankImportToggle.style.display = cfg.format === 'word' ? '' : 'none';
    }

    enableXxtDragging(panel, panel.querySelector('.xxt-header'), 'panel');

    // ==================== 设置弹窗 ====================
    // 创建设置弹窗
    const modal = document.createElement('div');
    modal.id = 'xxt-settings-modal';
    modal.innerHTML = `
      <div class="xxt-modal-box">
        <div class="xxt-modal-header">
          <h3>设置</h3>
          <button class="xxt-modal-close" id="xxt-modal-close">&times;</button>
        </div>
        <div class="xxt-setting-row">
          <span class="xxt-setting-label">主题</span>
          <div class="xxt-theme-group" id="xxt-theme-group">
            <button class="xxt-theme-btn" data-theme="auto">自动</button>
            <button class="xxt-theme-btn" data-theme="light">浅色</button>
            <button class="xxt-theme-btn" data-theme="dark">深色</button>
          </div>
        </div> 
        <div class="xxt-setting-row">
          <span class="xxt-setting-label">所有浮窗可拖拽</span>
          <label class="xxt-toggle">
            <input type="checkbox" id="xxt-chkDrag">
            <div class="xxt-checkbox-wrap"></div>
          </label>
        </div>
        <div class="xxt-setting-row">
          <span class="xxt-setting-label">记住面板位置</span>
          <label class="xxt-toggle">
            <input type="checkbox" id="xxt-chkRememberPos">
            <div class="xxt-checkbox-wrap"></div>
          </label>
        </div>
        <div class="xxt-setting-row">
          <span class="xxt-setting-label">提取快捷键</span>
          <div class="xxt-shortcut-display" id="xxt-shortcut-display">
            <span class="xxt-shortcut-keys" id="xxt-shortcut-keys"></span>
            <span class="xxt-shortcut-hint" id="xxt-shortcut-hint">点击修改</span>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    enableXxtDragging(modal.querySelector('.xxt-modal-box'), modal.querySelector('.xxt-modal-header'), 'settings');

    // 初始化主题按钮状态
    const themeBtns = modal.querySelectorAll('.xxt-theme-btn');
    function updateThemeUI() {
      themeBtns.forEach(b => {
        b.classList.toggle('active', b.dataset.theme === currentSettings.theme);
      });
    }
    updateThemeUI();

    // 初始化拖拽复选框
    const chkDrag = modal.querySelector('#xxt-chkDrag');
    chkDrag.checked = currentSettings.enableDrag;
    chkDrag.addEventListener('change', () => {
      currentSettings.enableDrag = chkDrag.checked;
      saveSettings(currentSettings);
    });

    // 初始化记忆面板位置复选框
    const chkRememberPos = modal.querySelector('#xxt-chkRememberPos');
    chkRememberPos.checked = currentSettings.rememberPanelPosition;
    chkRememberPos.addEventListener('change', () => {
      currentSettings.rememberPanelPosition = chkRememberPos.checked;
      if (!chkRememberPos.checked) {
        // 关闭记忆时清除所有浮窗保存的位置
        currentSettings.panelPosition = null;
        currentSettings.floatingPositions = {};
      }
      saveSettings(currentSettings);
    });

    themeBtns.forEach(b => {
      b.addEventListener('click', () => {
        currentSettings.theme = b.dataset.theme;
        applyTheme(currentSettings.theme);
        saveSettings(currentSettings);
        updateThemeUI();
      });
    });

    // 初始化快捷键显示
    const shortcutDisplay = modal.querySelector('#xxt-shortcut-display');
    const shortcutKeysEl = modal.querySelector('#xxt-shortcut-keys');
    const shortcutHintEl = modal.querySelector('#xxt-shortcut-hint');
    function updateShortcutUI() {
      shortcutKeysEl.textContent = formatShortcutLabel(currentSettings.shortcut);
    }
    updateShortcutUI();

    // 快捷键录制
    shortcutDisplay.addEventListener('click', () => {
      shortcutHintEl.textContent = '请按下新快捷键...';
      shortcutKeysEl.textContent = '...';
      shortcutDisplay.style.borderColor = '#1e88e5';
      window.__xxt_recording = true;

      function onKeyDown(e) {
        e.preventDefault();
        e.stopPropagation();
        const key = e.key;
        if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return;

        currentSettings.shortcut = {
          ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey, key: key.toLowerCase()
        };
        saveSettings(currentSettings);
        updateShortcutUI();
        shortcutHintEl.textContent = '点击修改';
        shortcutDisplay.style.borderColor = '';
        window.__xxt_recording = false;
        document.removeEventListener('keydown', onKeyDown, true);
      }
      document.addEventListener('keydown', onKeyDown, true);

      setTimeout(() => {
        if (window.__xxt_recording) {
          window.__xxt_recording = false;
          document.removeEventListener('keydown', onKeyDown, true);
          updateShortcutUI();
          shortcutHintEl.textContent = '点击修改';
          shortcutDisplay.style.borderColor = '';
        }
      }, 5000);
    });

    // 弹窗打开/关闭
    const settingsBtn = document.getElementById('xxt-settingsBtn');
    const modalClose = modal.querySelector('#xxt-modal-close');

    settingsBtn.addEventListener('click', () => {
      updateThemeUI();
      updateShortcutUI();
      modal.classList.add('open');
    });
    modalClose.addEventListener('click', () => { modal.classList.remove('open'); });
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('open');
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('open')) {
        modal.classList.remove('open');
      }
    }, { signal: uiEventController.signal });

    // ==================== 历史记录弹窗 ====================
    const historyModal = document.createElement('div');
    historyModal.id = 'xxt-history-modal';
    historyModal.innerHTML = `
      <div class="xxt-modal-box">
        <div class="xxt-modal-header">
          <h3>历史记录</h3>
          <button class="xxt-modal-close" id="xxt-history-close">&times;</button>
        </div>
        <div class="xxt-history-list" id="xxt-history-list">
          <div class="xxt-history-empty">暂无历史记录</div>
        </div>
      </div>
    `;
    document.body.appendChild(historyModal);
    enableXxtDragging(historyModal.querySelector('.xxt-modal-box'), historyModal.querySelector('.xxt-modal-header'), 'history');

    const historyListEl = historyModal.querySelector('#xxt-history-list');
    const historyCloseBtn = historyModal.querySelector('#xxt-history-close');

    function renderHistoryList() {
      const history = loadHistory();
      if (history.length === 0) {
        historyListEl.innerHTML = '<div class="xxt-history-empty">暂无历史记录</div>';
        return;
      }
      const fmtNames = { 'txt': 'TXT', 'md': 'MD', 'word': 'Word', 'pdf': 'PDF' };
      historyListEl.innerHTML = history.map(h => {
        const flags = [];
        if (h.withAnswers) flags.push('含答案');
        if (h.withWrong) flags.push('含错题');
        if (h.shuffle) flags.push('打乱');
        if (h.bankImport) flags.push('题库导入');
        const flagStr = flags.length > 0 ? ' · ' + flags.join('、') : '';
        return `
          <div class="xxt-history-item" data-id="${h.id}">
            <div class="xxt-history-info">
              <div class="xxt-history-title">${escapeHtml(h.title)}</div>
              <div class="xxt-history-meta">${h.date} · ${h.totalQuestions}题 · ${fmtNames[h.format] || h.format}${flagStr}</div>
            </div>
            <button class="xxt-history-download" data-id="${h.id}" title="重新下载">&#8681;</button>
            <button class="xxt-history-delete" data-id="${h.id}" title="删除">✕</button>
          </div>
        `;
      }).join('');

      // 点击历史条目 → 加载
      historyListEl.querySelectorAll('.xxt-history-item').forEach(item => {
        item.addEventListener('click', (e) => {
          if (e.target.closest('.xxt-history-delete')) return;
          if (e.target.closest('.xxt-history-download')) return;
          const id = Number(item.dataset.id);
          const entry = loadHistory().find(h => h.id === id);
          if (!entry) return;
          // 恢复提取数据；旧历史没有 hasCorrectAnswer 时从题目数据推断
          const results = entry.results && typeof entry.results === 'object' ? entry.results : {};
          const typeOrder = Array.isArray(entry.typeOrder) ? entry.typeOrder : Object.keys(results);
          const total = Number.isFinite(entry.totalQuestions)
            ? entry.totalQuestions
            : Object.values(results).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0);
          const inferredHasCorrectAnswer = Object.values(results).some(list =>
            Array.isArray(list) && list.some(q => String(q?.correctAnswer || '').trim() || hasRichContent(q?.correctAnswerContent))
          );
          const hasCorrectAnswer = typeof entry.hasCorrectAnswer === 'boolean'
            ? entry.hasCorrectAnswer
            : inferredHasCorrectAnswer;
          extractedData = {
            total, title: entry.title, typeOrder, results,
            wrongCount: entry.wrongCount || 0, hasMyAnswer: entry.hasMyAnswer || false, hasCorrectAnswer,
            breakdown: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, v.length])),
            text: formatOutput(results, typeOrder),
            textWithAnswers: formatOutputWithAnswers(results, typeOrder),
            textWrong: formatWrongQuestionsTXT(results, typeOrder),
            textMD: formatOutputMD(results, typeOrder),
            textWithAnswersMD: formatOutputWithAnswersMD(results, typeOrder),
            textWrongMD: formatWrongQuestionsMD(results, typeOrder),
          };
          resetExportQuestionSelection();
          // 恢复格式选项
          const fmtRadio = document.querySelector(`input[name="xxt-fmt"][value="${entry.format}"]`);
          if (fmtRadio) fmtRadio.checked = true;
          // 恢复复选框
          if (els.chkAnswers) {
            els.chkAnswers.checked = hasCorrectAnswer ? entry.withAnswers : false;
            els.chkAnswers.disabled = !hasCorrectAnswer;
          }
          const ansToggle = document.getElementById('xxt-ans-toggle');
          if (ansToggle) ansToggle.classList.toggle('xxt-disabled', !hasCorrectAnswer);
          if (els.chkShuffle) els.chkShuffle.checked = entry.shuffle;
          if (els.chkWrong) els.chkWrong.checked = entry.withWrong;
          if (els.chkBankImport) els.chkBankImport.checked = entry.bankImport || false;
          // 根据格式调整 UI
          const isWord = entry.format === 'word';
          if (els.wrongToggle) els.wrongToggle.style.display = isWord ? 'none' : '';
          if (els.wrongHint) els.wrongHint.style.display = isWord ? 'none' : '';
          // 题库导入格式选项仅在 Word 格式下显示
          if (els.bankImportToggle) els.bankImportToggle.style.display = isWord ? '' : 'none';
          // 题库导入格式：勾选时禁用打乱和答案选项（不隐藏，维持高度稳定）
          const isBankImport = entry.bankImport || false;
          const shuffleToggle = document.getElementById('xxt-shuffle-toggle');
          if (ansToggle) {
            ansToggle.classList.toggle('xxt-disabled', isBankImport || !hasCorrectAnswer);
            if (ansToggle.querySelector('input')) ansToggle.querySelector('input').disabled = isBankImport || !hasCorrectAnswer;
          }
          if (shuffleToggle) {
            shuffleToggle.classList.toggle('xxt-disabled', isBankImport);
            if (shuffleToggle.querySelector('input')) shuffleToggle.querySelector('input').disabled = isBankImport;
          }
          if (els.wrongToggle) {
            els.wrongToggle.classList.toggle('xxt-disabled', isBankImport);
            if (els.wrongToggle.querySelector('input')) els.wrongToggle.querySelector('input').disabled = isBankImport;
          }
          // 题库导入格式下，错题提示不显示（选项已禁用）
          if (entry.hasMyAnswer && entry.wrongCount > 0 && !isBankImport) {
            els.wrongToggle.classList.remove('xxt-hidden');
            els.wrongHint.textContent = `检测到 ${entry.wrongCount} 道错题，可勾选附加到输出末尾`;
            els.wrongHint.classList.remove('xxt-hidden');
          } else {
            els.wrongToggle.classList.add('xxt-hidden');
            els.wrongHint.classList.add('xxt-hidden');
          }
          renderStats(els);
          updateFilename(els);
          els.result.classList.remove('xxt-hidden');
          syncExtractionOptionState(extractedData);
          showStatus(els, `已加载历史记录：${entry.title} (${total}题)`, 'ok');
          historyModal.classList.remove('open');
          els.btnExtract.textContent = '重新提取';
        });
      });

      // 删除按钮
      historyListEl.querySelectorAll('.xxt-history-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = Number(btn.dataset.id);
          deleteHistoryById(id);
          renderHistoryList();
        });
      });

      // 监听每一条记录中的下载按钮：点击会从历史记录中直接重新导出
      historyListEl.querySelectorAll('.xxt-history-download').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = Number(btn.dataset.id);
          const entry = loadHistory().find(h => h.id === id);
          if (!entry) return;
          btn.disabled = true;
          btn.textContent = '...';
          try {
            const { results, typeOrder, title, format, withAnswers, withWrong, shuffle, bankImport } = entry;
            const activeResults = shuffle ? shuffleQuestions(results, typeOrder) : results;
            const cleanTitle = (title || '学习通题目').replace(/[\\/:*?"<>|]/g, '_').substring(0, 60);
            if (format === 'word') {
              // Word 历史重导出始终生成原生 Office Open XML .docx。
              const blob = await generateWordBlob(activeResults, typeOrder, title, withAnswers, withWrong, bankImport);
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url; a.download = cleanTitle + '.docx'; a.click();
              URL.revokeObjectURL(url);
            } else if (format === 'pdf') {
              await generatePdf(activeResults, typeOrder, title, withAnswers, withWrong, cleanTitle + '.pdf');
            } else {
              const ext = format === 'md' ? '.md' : '.txt';
              const mime = format === 'md' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8';
              let text = withAnswers
                ? (format === 'md' ? formatOutputWithAnswersMD(activeResults, typeOrder) : formatOutputWithAnswers(activeResults, typeOrder))
                : (format === 'md' ? formatOutputMD(activeResults, typeOrder) : formatOutput(activeResults, typeOrder));
              // 含错题标记时追加错题汇总
              if (withWrong) {
                text += format === 'md' ? formatWrongQuestionsMD(activeResults, typeOrder) : formatWrongQuestionsTXT(activeResults, typeOrder);
              }
              const blob = new Blob([text], { type: mime });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url; a.download = cleanTitle + ext; a.click();
              URL.revokeObjectURL(url);
            }
          } catch (err) {
            alert('导出失败: ' + err.message);
          }
          btn.disabled = false;
          btn.textContent = '\u{21E9}';
        });
      });
    }

    function escapeHtml(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }

    // 历史记录按钮 → 打开弹窗
    const historyBtn = document.getElementById('xxt-historyBtn');
    historyBtn.addEventListener('click', () => {
      renderHistoryList();
      historyModal.classList.add('open');
    });
    historyCloseBtn.addEventListener('click', () => { historyModal.classList.remove('open'); });
    historyModal.addEventListener('click', (e) => {
      if (e.target === historyModal) historyModal.classList.remove('open');
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && historyModal.classList.contains('open')) {
        historyModal.classList.remove('open');
      }
    }, { signal: uiEventController.signal });

    // ==================== 整门课章节测验批量提取 ====================
    // 只读取用户勾选的章节测验：每次通过课程目录的原生点击进入下一章，
    // 等新题目页/iframe 确认更新后再提取并合并，不会提交答案或修改学习进度。
    const batchModal = document.createElement('div');
    batchModal.id = 'xxt-batch-modal';
    batchModal.innerHTML = `
      <div class="xxt-batch-box" role="dialog" aria-modal="true" aria-labelledby="xxt-batch-title">
        <div class="xxt-modal-header">
          <h3 id="xxt-batch-title">📚 按课程任务点提取章节测验</h3>
          <button class="xxt-modal-close" id="xxt-batch-close" type="button" aria-label="关闭">&times;</button>
        </div>
        <div class="xxt-batch-note" id="xxt-batch-note">正在从当前课程目录识别任务点。勾选后会读取每个任务点中的真实章节测验任务，再按任务逐个打开和累加提取。</div>
        <div class="xxt-batch-toolbar">
          <button type="button" id="xxt-batch-rescan">重新扫描目录</button>
          <button type="button" id="xxt-batch-select-all">全选</button>
          <button type="button" id="xxt-batch-select-none">取消全选</button>
        </div>
        <div class="xxt-batch-list" id="xxt-batch-list"></div>
        <div class="xxt-batch-actions">
          <div class="xxt-batch-progress" id="xxt-batch-progress"></div>
          <button type="button" id="xxt-batch-stop" class="xxt-batch-stop xxt-hidden">停止</button>
          <button type="button" id="xxt-batch-start">开始提取</button>
        </div>
      </div>
    `;
    document.body.appendChild(batchModal);
    const batchProgressCard = document.createElement('aside');
    batchProgressCard.id = 'xxt-batch-progress-card';
    batchProgressCard.setAttribute('aria-live', 'polite');
    batchProgressCard.innerHTML = `
      <div class="xxt-batch-card-head"><strong class="xxt-batch-card-title">📚 整门课题目提取</strong><button type="button" class="xxt-batch-card-close" data-batch-card-close aria-label="关闭进度">&times;</button></div>
      <div class="xxt-batch-card-note">正在自动跳转任务点并提取。请不要切换课程、手动点击任务点、刷新页面或收起目录。</div>
      <div class="xxt-batch-card-current" data-batch-card-current>准备中…</div>
      <div class="xxt-batch-card-detail" data-batch-card-detail></div>
      <div class="xxt-batch-card-bar"><i data-batch-card-bar></i></div>
      <div class="xxt-batch-card-actions"><button type="button" data-batch-card-stop>停止提取</button></div>`;
    document.body.appendChild(batchProgressCard);
    enableXxtDragging(batchModal.querySelector('.xxt-batch-box'), batchModal.querySelector('.xxt-modal-header'), 'batch');
    enableXxtDragging(batchProgressCard, batchProgressCard.querySelector('.xxt-batch-card-head'), 'batchProgress');
    const batchNote = batchModal.querySelector('#xxt-batch-note');
    const batchList = batchModal.querySelector('#xxt-batch-list');
    const batchProgress = batchModal.querySelector('#xxt-batch-progress');
    const batchStartButton = batchModal.querySelector('#xxt-batch-start');
    const batchStopButton = batchModal.querySelector('#xxt-batch-stop');
    let batchEntries = [];
    // 暂停后的运行上下文只保存在当前页面会话：继续时不会重新统计已完成
    // 的章节测验，也不会丢掉已经合并到结果面板里的题目。
    let batchPausedRun = null;

    function batchQuestionCount(run) {
      return Number(run && run.added || 0);
    }

    function formatBatchLogTime(timestamp = Date.now()) {
      const date = new Date(timestamp);
      return [date.getHours(), date.getMinutes(), date.getSeconds()]
        .map(value => String(value).padStart(2, '0')).join(':');
    }

    function renderBatchLiveLog(run = batchExtractionRun || batchPausedRun) {
      const live = els.batchLive;
      if (!live) return;
      const list = live.querySelector('[data-batch-live-log]');
      const count = live.querySelector('[data-batch-live-log-count]');
      const items = Array.isArray(run && run.logs) ? run.logs : [];
      count.textContent = String(items.length);
      list.innerHTML = items.map(item => `<div class="xxt-batch-log-item${item.level ? ` is-${escapeHtml(item.level)}` : ''}"><time class="xxt-batch-log-time">${escapeHtml(formatBatchLogTime(item.at))}</time><span>${escapeHtml(item.message)}</span></div>`).join('');
      list.scrollTop = list.scrollHeight;
    }

    function appendBatchLog(message, level = '') {
      const run = batchExtractionRun || batchPausedRun;
      if (!run) return;
      if (!Array.isArray(run.logs)) run.logs = [];
      run.logs.push({ at: Date.now(), message: String(message || ''), level });
      if (run.logs.length > 120) run.logs.splice(0, run.logs.length - 120);
      renderBatchLiveLog(run);
    }

    function updateBatchLiveProgress(message, detail = '', completed = 0, total = 0) {
      const live = els.batchLive;
      if (!live) return;
      const run = batchExtractionRun || batchPausedRun;
      if (!run) {
        live.classList.add('xxt-hidden');
        return;
      }
      const isRunning = !!run.running;
      const isPaused = !isRunning && !!run.stopped;
      const state = isRunning ? '正在提取' : isPaused ? '已暂停' : '已完成';
      const stateNode = live.querySelector('[data-batch-live-state]');
      const currentNode = live.querySelector('[data-batch-live-current]');
      const detailNode = live.querySelector('[data-batch-live-detail]');
      const bar = live.querySelector('[data-batch-live-bar]');
      const resume = live.querySelector('[data-batch-live-resume]');
      const restart = live.querySelector('[data-batch-live-restart]');
      const stop = live.querySelector('[data-batch-live-stop]');
      live.classList.remove('xxt-hidden');
      stateNode.textContent = state;
      stateNode.classList.toggle('is-paused', isPaused);
      stateNode.classList.toggle('is-done', !isRunning && !isPaused);
      currentNode.textContent = message;
      detailNode.textContent = detail;
      bar.style.width = total ? `${Math.max(0, Math.min(100, completed / total * 100))}%` : '0%';
      resume.classList.toggle('xxt-hidden', !isPaused);
      restart.classList.toggle('xxt-hidden', isRunning);
      stop.classList.toggle('xxt-hidden', !isRunning);
      stop.disabled = !!run.stopped;
      renderBatchLiveLog(run);
    }

    function updateBatchProgress(message, detail = '', completed = 0, total = 0) {
      batchProgress.textContent = message;
      batchProgressCard.querySelector('[data-batch-card-current]').textContent = message;
      batchProgressCard.querySelector('[data-batch-card-detail]').textContent = detail;
      batchProgressCard.querySelector('[data-batch-card-bar]').style.width = total ? `${Math.max(0, Math.min(100, completed / total * 100))}%` : '0%';
      updateBatchLiveProgress(message, detail, completed, total);
    }

    // 进度统一显示在已打开的主面板中，不再额外遮住课程内容。
    function showBatchProgressCard() { batchProgressCard.classList.remove('open'); }
    function hideBatchProgressCard() {
      if (!(batchExtractionRun && batchExtractionRun.running)) batchProgressCard.classList.remove('open');
    }

    // 参照 OCS：目录里每一个 getTeacherAjax 都是一个独立任务点（例如
    // 1.1、1.2），第三个参数是其真实 chapterId。进入该任务点后，再从
    // 当前页面 attachments 和 iframe 的 jobid 读取其中的多个章节测验。
    const BATCH_TASKPOINT_SELECTOR = '[onclick^="getTeacherAjax"], [onclick*="getTeacherAjax("]';
    const BATCH_TASKPOINT_ATTRIBUTES = ['data-knowledgeid', 'data-knowledge-id', 'data-chapterid', 'data-chapter-id', 'data-id'];

    function normalizeBatchText(value) {
      return String(value || '').replace(/\s+/g, ' ').trim();
    }

    function collectBatchCatalogDocuments() {
      const docs = [];
      const seen = new Set();
      const visit = doc => {
        if (!doc || seen.has(doc)) return;
        seen.add(doc); docs.push(doc);
        let frames = [];
        try { frames = Array.from(doc.querySelectorAll('iframe')); } catch (e) { return; }
        frames.forEach(frame => {
          try { visit(frame.contentDocument || (frame.contentWindow && frame.contentWindow.document)); } catch (e) {}
        });
      };
      visit(document);
      return docs;
    }

    function findBatchClickTarget(node) {
      if (!node || !node.closest) return node;
      if (node.matches && node.matches('[onclick*="getTeacherAjax"]')) return node;
      return node.closest('[onclick*="getTeacherAjax"]') || node;
    }

    function extractBatchTaskPointId(node) {
      for (let current = node, depth = 0; current && depth < 6; current = current.parentElement, depth++) {
        const onclick = current.getAttribute && current.getAttribute('onclick') || '';
        const directTeacherMatch = onclick.match(/getTeacherAjax\s*\(\s*(['"]?)[^,)'"]+\1\s*,\s*(['"]?)[^,)'"]+\2\s*,\s*(['"]?)([^,)'"]+)\3/i);
        if (directTeacherMatch && /^\d{4,}$/.test(String(directTeacherMatch[4] || ''))) return String(directTeacherMatch[4]);
        for (const attr of BATCH_TASKPOINT_ATTRIBUTES) {
          // data-id 在页面中也常用于普通 DOM 节点；只有目录/任务节点才把它当作
          // knowledgeId 候选，避免扫描到无关数字 ID 后误跳转。
          if (attr === 'data-id' && !current.matches?.('.posCatalog, .posCatalog_name, .posCatalog_select, [class*="catalog"], [class*="Catalog"], [class*="task"], [class*="Task"], [class*="chapter"], [class*="Chapter"]')) continue;
          const value = current.getAttribute && current.getAttribute(attr);
          if (/^\d{4,}$/.test(String(value || ''))) return String(value);
        }
        const id = current.id || '';
        const idMatch = id.match(/^cur(\d{4,})$/i);
        if (idMatch) return idMatch[1];
        const source = `${current.getAttribute && current.getAttribute('href') || ''} ${current.getAttribute && current.getAttribute('onclick') || ''}`;
        const paramMatch = source.match(/(?:chapterId|chapterid|knowledgeId|knowledgeid)\s*(?:=|:|%3D)\s*['"]?(\d{4,})/i);
        if (paramMatch) return paramMatch[1];
        // 课程目录的原生 onclick 通常是
        // getTeacherAjax(courseId, clazzId, chapterId)。前两个参数不是
        // 任务点 ID，不能像普通函数一样取第一个数字；OCS 也明确读取
        // 第三个参数作为 chapterId/knowledgeId。
        const teacherMatch = source.match(/getTeacherAjax\s*\(\s*(['"]?)[^,)'\"]+\1\s*,\s*(['"]?)[^,)'\"]+\2\s*,\s*(['"]?)(\d{4,})\3/i);
        if (teacherMatch) return teacherMatch[4];
        const oldMatch = source.match(/toOld\s*\(\s*[^,)]*,\s*[^,)]*,\s*(['"]?)(\d{4,})\1/i);
        if (oldMatch) return oldMatch[2];
      }
      return '';
    }

    function getBatchEntryLabel(node) {
      const text = normalizeBatchText(node && node.textContent);
      return text && text.length <= 180 ? text : '未命名任务点';
    }

    function scanChapterTestEntries() {
      const entries = [];
      const seen = new Set();
      collectBatchCatalogDocuments().forEach((doc, documentIndex) => {
        let nodes = [];
        try { nodes = Array.from(doc.querySelectorAll(BATCH_TASKPOINT_SELECTOR)); } catch (e) { return; }
        nodes.forEach(node => {
          if (node.closest && node.closest('#xxt-panel, #xxt-settings-modal, #xxt-history-modal, #xxt-bank-modal, #xxt-save-bank-modal, #xxt-batch-modal, #xxt-preview-modal')) return;
          const knowledgeId = extractBatchTaskPointId(node);
          if (!knowledgeId) return;
          const target = findBatchClickTarget(node);
          if (!target) return;
          const href = target.getAttribute && target.getAttribute('href') || '';
          const onclick = target.getAttribute && target.getAttribute('onclick') || '';
          const label = getBatchEntryLabel(node);
          const identity = knowledgeId;
          if (seen.has(identity)) return;
          seen.add(identity);
          entries.push({
            id: `batch-${documentIndex}-${entries.length}-${Date.now()}`,
            label, knowledgeId, href, onclick,
            documentIndex, selected: true, state: 'pending', kind: 'taskpoint', detail: '', tasks: null
          });
        });
      });
      return entries;
    }

    function locateBatchEntry(entry) {
      const docs = collectBatchCatalogDocuments();
      const preferred = docs[entry.documentIndex] ? [docs[entry.documentIndex], ...docs.filter(doc => doc !== docs[entry.documentIndex])] : docs;
      for (const doc of preferred) {
        let nodes = [];
        try { nodes = Array.from(doc.querySelectorAll(BATCH_TASKPOINT_SELECTOR)); } catch (e) { continue; }
        for (const node of nodes) {
          if (extractBatchTaskPointId(node) === entry.knowledgeId) return findBatchClickTarget(node);
        }
      }
      return null;
    }

    function getBatchCourseContext() {
      const contexts = [];
      getBatchHostWindows().forEach(host => {
        try { contexts.push(new URL(host.location.href).searchParams); } catch (e) {}
      });
      try { contexts.push(new URL(window.location.href).searchParams); } catch (e) {}
      const value = (...keys) => {
        for (const params of contexts) {
          const result = keys.map(key => params.get(key)).find(item => item);
          if (result) return result;
        }
        return '';
      };
      return { courseId: value('courseId', 'courseid') || '', clazzId: value('clazzid', 'classId', 'classid') || '', cpi: value('cpi') || '' };
    }

    function extractBalancedObject(source, startAt) {
      const start = source.indexOf('{', startAt);
      if (start < 0) return '';
      let depth = 0; let quote = ''; let escaped = false;
      for (let i = start; i < source.length; i++) {
        const ch = source[i];
        if (quote) {
          if (escaped) escaped = false;
          else if (ch === '\\') escaped = true;
          else if (ch === quote) quote = '';
          continue;
        }
        if (ch === '"' || ch === "'") { quote = ch; continue; }
        if (ch === '{') depth++;
        else if (ch === '}' && --depth === 0) return source.slice(start, i + 1);
      }
      return '';
    }

    function parseBatchCardsResponse(html) {
      const source = String(html || '')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'");
      // 学习通当前 cards 页面常为：try { mArg = {...}; }，因此第一个花括号
      // 属于 try 块而不是 JSON。必须从 mArg 等号后的花括号开始读取。
      // 有些旧版本会先赋给 $mArg / mArgJson，也一并兼容。
      const assignment = /\b(?:\$?mArg(?:Json)?)\s*=\s*/ig;
      const attachmentAt = source.indexOf('"attachments"');
      const starts = [];
      let match;
      while ((match = assignment.exec(source))) {
        starts.push(source.indexOf('{', match.index + match[0].length));
      }
      if (attachmentAt >= 0) {
        let start = source.lastIndexOf('{', attachmentAt);
        while (start >= 0 && starts.length < 80) {
          starts.push(start);
          start = source.lastIndexOf('{', start - 1);
        }
      }
      for (const start of [...new Set(starts)].filter(index => index >= 0)) {
        const jsonText = extractBalancedObject(source, start);
        if (!jsonText) continue;
        try {
          const payload = JSON.parse(jsonText);
          if (payload && Array.isArray(payload.attachments)) return payload;
        } catch (e) {}
      }
      return null;
    }

    function getBatchHostWindows() {
      const windows = [];
      const seen = new Set();
      const add = value => { if (value && !seen.has(value)) { seen.add(value); windows.push(value); } };
      try { add(typeof unsafeWindow !== 'undefined' ? unsafeWindow : null); } catch (e) {}
      let current = window;
      for (let depth = 0; current && depth < 8; depth++) {
        add(current);
        try { if (current.parent === current) break; current = current.parent; } catch (e) { break; }
      }
      collectBatchCatalogDocuments().forEach(doc => { try { add(doc.defaultView); } catch (e) {} });
      return windows;
    }

    function findBatchActiveCatalog(entry) {
      const id = `cur${entry.knowledgeId}`;
      return collectBatchCatalogDocuments().some(doc => {
        try { return !!doc.getElementById(id) || !!doc.querySelector(`.posCatalog_active[id="${id}"]`); } catch (e) { return false; }
      });
    }

    // OCS 的第三个参数才是具体任务点 ID。优先调用课程页自己的导航函数，
    // 让学习通按原生逻辑切换可见内容，不再创建隐藏 iframe。
    async function activateBatchTaskPoint(entry, context) {
      let invoked = false;
      for (const host of getBatchHostWindows()) {
        let teacherAjax = null;
        try { teacherAjax = host.getTeacherAjax; } catch (e) {}
        if (typeof teacherAjax !== 'function') continue;
        try {
          teacherAjax.call(host, context.courseId, context.clazzId, entry.knowledgeId);
          invoked = true;
          break;
        } catch (e) {}
      }
      if (!invoked) {
        const target = locateBatchEntry(entry);
        if (!target) return false;
        try { target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })); invoked = true; } catch (e) {}
      }
      if (invoked) await batchSleep(500);
      return invoked;
    }

    function getBatchCurrentChapterId(host) {
      try {
        const input = host && host.document && host.document.querySelector('#curChapterId');
        return String(input && input.value || '');
      } catch (e) {
        return '';
      }
    }

    // 优先点学习通页面真正展示的“下一节”按钮。它本身会调用课程的 PCount
    // 逻辑，能与人工点击保持完全一致；PCount.next 只作为旧页面的兼容回退。
    function findBatchNativeNextButton(host) {
      try {
        const doc = host && host.document;
        if (!doc) return null;
        const direct = doc.querySelector('#prevNextFocusNext, [id*="prevNextFocusNext"]');
        if (direct && !direct.disabled && direct.getAttribute('aria-disabled') !== 'true') return direct;
        return Array.from(doc.querySelectorAll('button, a, input[type="button"], [role="button"]')).find(node => {
          const text = normalizeBatchText(`${node.getAttribute('title') || ''} ${node.getAttribute('aria-label') || ''} ${node.value || ''} ${node.textContent || ''}`);
          return /下一节/.test(text) && !node.disabled && node.getAttribute('aria-disabled') !== 'true';
        }) || null;
      } catch (e) {
        return null;
      }
    }

    // 与 OCS 的“下一节”模式一致：由课程页的原生下一节控件推进，不改写 URL。
    async function activateBatchNextTaskPoint(currentEntry, expectedEntry, context) {
      const expectedId = String(expectedEntry && expectedEntry.knowledgeId || '');
      if (!expectedId) return false;
      let invoked = false;

      for (const host of getBatchHostWindows()) {
        const button = findBatchNativeNextButton(host);
        if (!button) continue;
        try {
          button.click();
          invoked = true;
          break;
        } catch (e) {}
      }

      // 某些旧课程页没有可点击的原生按钮，才退回同一套页面导航函数。
      for (const host of getBatchHostWindows()) {
        if (invoked) break;
        try {
          const doc = host.document;
          const chapterId = doc.querySelector('#curChapterId') && doc.querySelector('#curChapterId').value;
          const courseId = doc.querySelector('#curCourseId') && doc.querySelector('#curCourseId').value;
          const clazzId = doc.querySelector('#curClazzId') && doc.querySelector('#curClazzId').value;
          const tabs = doc.querySelectorAll('#prev_tab .prev_ul li, .prev_ul li');
          if (!host.PCount || typeof host.PCount.next !== 'function' || !chapterId || !courseId || !clazzId) continue;
          host._preChapterId = String(chapterId);
          host.PCount.next(String(tabs.length), String(chapterId), String(courseId), String(clazzId), '');
          invoked = true;
          break;
        } catch (e) {}
      }
      if (!invoked) return false;
      const startedAt = Date.now();
      while (Date.now() - startedAt < 7000) {
        if (findBatchActiveCatalog(expectedEntry) || getBatchHostWindows().some(host => getBatchCurrentChapterId(host) === expectedId)) return true;
        await batchSleep(180);
      }
      return false;
    }

    async function waitForBatchTaskPointActive(entry, timeout = 3500) {
      const startedAt = Date.now();
      while (Date.now() - startedAt < timeout) {
        if (findBatchActiveCatalog(entry)) return true;
        await batchSleep(180);
      }
      return false;
    }

    function getBatchGlobalAttachments() {
      const candidates = [];
      for (const host of getBatchHostWindows()) {
        try { if (Array.isArray(host.attachments)) candidates.push(host.attachments); } catch (e) {}
      }
      return candidates.sort((a, b) => b.length - a.length)[0] || [];
    }

    function batchAttachmentSignature(attachments) {
      return (attachments || []).map(attachment => String(
        attachment && (attachment.jobid || attachment.property && attachment.property._jobid || attachment.property && attachment.property.mid || '')
      )).filter(Boolean).join('|');
    }

      // cards 接口的 num 是“该章节中的第几张任务卡”，不是附件分页号。
      // 用卡片内容做签名，服务端重复返回同一张卡时停止；不能按单张卡的
      // 附件数量提前停止。
    function batchCardSignature(attachments) {
      return (attachments || []).map((attachment, index) => {
        const property = attachment && attachment.property || {};
        return [
          attachment && attachment.type || '',
          attachment && attachment.jobid || property._jobid || '',
          property.workid || '',
          property.objectid || property.mid || property.name || attachment && attachment.title || index,
          attachment && attachment.enc || ''
        ].map(value => String(value)).join('\u001f');
      }).join('\u001e');
    }

    async function waitForBatchGlobalAttachments(previousSignature, previousObject, timeout = 12000) {
      const startedAt = Date.now();
      while (Date.now() - startedAt < timeout) {
        const attachments = getBatchGlobalAttachments();
        const signature = batchAttachmentSignature(attachments);
        if (attachments.length && (!previousSignature || signature !== previousSignature || attachments !== previousObject)) return attachments;
        await batchSleep(250);
      }
      return getBatchGlobalAttachments();
    }

    async function requestBatchTaskPointCards(entry, context) {
      const attachments = [];
      const maxCards = 80;
      const seenSignatures = new Set();
      let scannedCards = 0;
      let sawValidCard = false;
      let stopReason = 'limit';
      entry.cardScan = null;

      const parseResponse = html => {
        const source = String(html || '').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'");
        const assignment = /\b(?:\$?mArg(?:Json)?)\s*=\s*/ig;
        let match;
        while ((match = assignment.exec(source))) {
          const jsonText = extractBalancedObject(source, source.indexOf('{', match.index + match[0].length));
          if (!jsonText) continue;
          try {
            const payload = JSON.parse(jsonText);
            if (payload && Array.isArray(payload.attachments)) return payload;
          } catch (e) {}
        }
        return parseBatchCardsResponse(source);
      };

      // 与九九助手一致：从 num=0 起逐张读取章节内任务卡。普通视频、
      // 文档、学习目标等也会被读到，但只会在后续转换阶段保留 workid。
      for (let cardIndex = 0; cardIndex < maxCards; cardIndex++) {
        const params = new URLSearchParams({
          clazzid: String(context.clazzId),
          courseid: String(context.courseId),
          knowledgeid: String(entry.knowledgeId),
          num: String(cardIndex),
          ut: 's',
          cpi: String(context.cpi || ''),
          v: '20160407-1',
          _t: String(Date.now())
        });
        const cardUrl = new URL('/mooc-ans/knowledge/cards', location.origin);
        cardUrl.search = params.toString();
        let payload = null;
        let responseText = '';
        let lastError = null;
        for (let attempt = 0; attempt < 2 && !payload; attempt++) {
          try {
            const url = new URL(cardUrl);
            url.searchParams.set('retry', String(attempt));
            const response = await fetch(url.toString(), { credentials: 'include', cache: 'no-store' });
            if (!response.ok) throw new Error(`任务点卡片请求失败（${response.status}）`);
            responseText = await response.text();
            payload = parseResponse(responseText);
          } catch (error) {
            lastError = error;
          }
          if (!payload && attempt === 0) await batchSleep(250);
        }

        if (!payload || !Array.isArray(payload.attachments) || !payload.attachments.length) {
          entry.cardResponseDebug = {
            hasMArg: /\bmArg(?:Json)?\s*=/i.test(responseText),
            hasAttachments: /["']attachments["']\s*:/.test(responseText),
            sample: responseText.slice(0, 220),
            error: lastError ? String(lastError.message || lastError) : ''
          };
          if (lastError) throw lastError;
          stopReason = payload ? 'empty' : 'no-next-card';
          break;
        }

        // 同一个任务卡可能因网络重试/课程端回退而再次返回。连续或隔页重复
        // 都说明不能再通过 cards 找到新的原生任务卡，停止即可。
        const signature = batchCardSignature(payload.attachments);
        if (signature && seenSignatures.has(signature)) {
          stopReason = 'repeated-card';
          break;
        }
        if (signature) seenSignatures.add(signature);
        sawValidCard = true;
        scannedCards++;
        attachments.push(...payload.attachments);
      }

      entry.cardScan = {
        scanned: sawValidCard,
        cards: scannedCards,
        attachments: attachments.length,
        stopReason
      };
      window.__xxt_batch_debug = { entry: entry.knowledgeId, ...entry.cardScan, cardResponse: entry.cardResponseDebug || null };
      return attachments;
    }

    // 当前章节加载完成后，课程页会把所有任务点渲染为 .prev_ul li。这里直接
    // 读取这些原生任务卡，而不是通过 cards 接口猜测 workId：一张视频卡不会
    // 再导致同章后面的“章节测验”被漏掉。
    function getBatchNativeTaskTabs(entry) {
      const expectedChapterId = String(entry && entry.knowledgeId || '');
      const tabs = [];
      const seen = new Set();
      for (const doc of collectBatchCatalogDocuments()) {
        try {
          const currentChapterId = String(doc.querySelector('#curChapterId') && doc.querySelector('#curChapterId').value || '');
          const nodes = Array.from(doc.querySelectorAll('#prev_tab .prev_ul li, .prev_ul li'));
          if (!nodes.length) continue;
          const belongsToChapter = !expectedChapterId || currentChapterId === expectedChapterId || nodes.some(node => (node.getAttribute('onclick') || '').includes(expectedChapterId));
          if (!belongsToChapter) continue;
          nodes.forEach((tab, tabIndex) => {
            if (seen.has(tab)) return;
            seen.add(tab);
            const onclick = tab.getAttribute('onclick') || '';
            const text = normalizeBatchText([
              tab.getAttribute('title') || '',
              tab.getAttribute('aria-label') || '',
              tab.getAttribute('data-title') || '',
              tab.getAttribute('data-name') || '',
              tab.textContent || ''
            ].join(' '));
            tabs.push({
              tab, tabIndex, onclick, text,
              signature: `${tab.id || ''}\u001f${onclick}\u001f${text}`,
              chapterId: currentChapterId || expectedChapterId
            });
          });
        } catch (e) {}
      }
      return tabs;
    }

    function isBatchChapterTestTab(tabInfo) {
      const source = normalizeBatchText(`${tabInfo && tabInfo.text || ''} ${tabInfo && tabInfo.onclick || ''}`);
      return /章节\s*(?:测验|测试)/i.test(source);
    }

    function getBatchNativeTaskIds(tabInfo) {
      const source = `${tabInfo && tabInfo.onclick || ''} ${tabInfo && tabInfo.tab && tabInfo.tab.outerHTML || ''}`;
      const jobMatch = source.match(/(?:jobid|_jobid)\s*[=:]\s*['"]?([^,'"}\s]+)/i) || source.match(/\b(work-[a-z0-9-]{8,})\b/i);
      const workMatch = source.match(/(?:workid|workId)\s*[=:]\s*['"]?(?:work-)?([^,'"}\s]+)/i);
      const jobId = String(jobMatch && jobMatch[1] || '');
      return {
        jobId,
        workId: String(workMatch && workMatch[1] || jobId).replace(/^work-/, '')
      };
    }

    async function resolveBatchNativeTaskPointTasks(entry, timeout = 12000) {
      const startedAt = Date.now();
      await waitForBatchTaskPointActive(entry);
      while (Date.now() - startedAt < timeout) {
        const tabs = getBatchNativeTaskTabs(entry);
        if (tabs.length) {
          const testTabs = tabs.filter(isBatchChapterTestTab);
          entry.nativeTaskScan = { cards: tabs.length, chapterTests: testTabs.length };
          return testTabs.map((tabInfo, index) => {
            const ids = getBatchNativeTaskIds(tabInfo);
            return {
              ...entry,
              id: `${entry.id}-native-task-${index}`,
              label: `${entry.label} · ${tabInfo.text || `章节测验 ${index + 1}`}`,
              taskPointId: entry.knowledgeId,
              workId: ids.workId,
              jobId: ids.jobId,
              nativeTab: tabInfo.tab,
              nativeTabIndex: tabInfo.tabIndex,
              nativeTabSignature: tabInfo.signature,
              nativeTaskLabel: tabInfo.text,
              targetUrl: '', fallbackTargetUrl: '',
              kind: 'native-task', state: 'pending',
              detail: `任务点 ${entry.knowledgeId} · 原生任务卡 ${tabInfo.tabIndex + 1}`
            };
          });
        }
        await batchSleep(220);
      }
      entry.nativeTaskScan = { cards: 0, chapterTests: 0 };
      return [];
    }

    // 批量提取只使用页面当前章节的原生任务卡。cards 相关兼容函数保留给
    // 单页旧版页面排障，但不参与整门课的导航或章节测验发现。
    async function resolveBatchTaskPointTasks(entry) {
      if (entry.tasks) return entry.tasks;
      const tasks = await resolveBatchNativeTaskPointTasks(entry);
      entry.tasks = tasks;
      return tasks;
    }

    async function resolveBatchTaskPointTasksFromCards(entry) {
      if (entry.tasks) return entry.tasks;
      const context = getBatchCourseContext();
      if (!context.courseId || !context.clazzId || !entry.knowledgeId) return [];
      await waitForBatchTaskPointActive(entry);
      let attachments = [];
      let cardScanError = null;
      try {
        // 不使用当前可见 iframe 的 attachments 作为优先结果：它通常只有本章
        // 第一张卡（常为视频），会把后面的章节测验永久漏掉。
        attachments = await requestBatchTaskPointCards(entry, context);
      } catch (error) {
        cardScanError = error;
      }
      if (!(entry.cardScan && entry.cardScan.scanned)) {
        const visibleAttachments = await waitForBatchGlobalAttachments(entry.attachmentsBefore || '', entry.attachmentsBeforeObject, 2800);
        if (visibleAttachments.length) attachments = visibleAttachments;
      }
      const tasks = [];
      const seen = new Set();
      attachments.forEach((attachment, index) => {
        if (!attachment || attachment.type !== 'workid') return;
        const property = attachment.property || {};
        // 九九助手的字段约定：jobid 通常是 work-xxxx，property.workid 是
        // 不带前缀的真实 workId；两者都存在时优先保留原始 jobid 作为 jobId。
        const rawJobId = attachment.jobid || property._jobid || '';
        const workId = String(property.workid || rawJobId || '').replace(/^work-/, '');
        if (!workId) return;
        const jobId = String(rawJobId || `work-${workId}`);
        const taskKey = `${entry.knowledgeId}|${workId}|${jobId}`;
        if (seen.has(taskKey)) return;
        seen.add(taskKey);
        const params = new URLSearchParams({
          workId: workId, courseId: context.courseId, clazzId: context.clazzId,
          knowledgeId: entry.knowledgeId, jobId, enc: String(attachment.enc || ''),
          cpi: String(context.cpi || ''), ut: 's', mooc2: '1'
        });
        const title = normalizeBatchText(property.title || property.name || attachment.title || `章节测验任务 ${index + 1}`);
        tasks.push({
          ...entry, id: `${entry.id}-task-${index}`, label: `${entry.label} · ${title}`,
          taskPointId: entry.knowledgeId, workId, jobId,
          attachment,
          targetUrl: `${location.origin}/mooc-ans/work/view?${params.toString()}`,
          fallbackTargetUrl: `${location.origin}/mooc-ans/work/phone/work?${params.toString()}`,
          // OCS 的任务发现依赖章节页实际渲染出的 iframe，而不是拼接 URL。
          // 这里记录 jobId，用原生任务卡切换后按它确认目标 iframe。
          kind: 'task', state: 'pending', detail: `任务点 ${entry.knowledgeId} · workId ${workId}`
        });
      });
      // 部分学校不让 cards 接口返回附件，但页面切换后会直接渲染测验链接。
      // 读取链接中的 knowledgeId/workId，仍以任务点为准，绝不以任务标题匹配。
      if (!tasks.length) {
        const links = [];
        collectBatchCatalogDocuments().forEach(doc => {
          try { doc.querySelectorAll('a[href*="/work/view"], a[href*="/work/phone/work"]').forEach(link => links.push(link)); } catch (e) {}
        });
        links.forEach((link, index) => {
          let url;
          try { url = new URL(link.href || link.getAttribute('href') || '', location.href); } catch (e) { return; }
          const taskPointId = url.searchParams.get('knowledgeId') || url.searchParams.get('chapterId') || '';
          if (taskPointId && String(taskPointId) !== String(entry.knowledgeId)) return;
          const workId = String(url.searchParams.get('workId') || url.searchParams.get('workid') || '').replace(/^work-/, '');
          if (!workId) return;
          const jobId = url.searchParams.get('jobId') || url.searchParams.get('jobid') || `work-${workId}`;
          const taskKey = `${entry.knowledgeId}|${workId}|${jobId}`;
          if (seen.has(taskKey)) return;
          seen.add(taskKey);
          tasks.push({
            ...entry, id: `${entry.id}-dom-task-${index}`,
            label: `${entry.label} · ${normalizeBatchText(link.textContent) || `章节测验任务 ${index + 1}`}`,
            taskPointId: entry.knowledgeId, workId, jobId,
            targetUrl: url.href, fallbackTargetUrl: url.href,
            kind: 'task', state: 'pending', detail: `任务点 ${entry.knowledgeId} · workId ${workId}`
          });
        });
      }
      if (!tasks.length && cardScanError) throw cardScanError;
      entry.tasks = tasks;
      return tasks;
    }

    function renderBatchEntries() {
      const running = !!(batchExtractionRun && batchExtractionRun.running);
      if (!batchEntries.length) {
        batchList.innerHTML = '<div class="xxt-batch-empty">未在当前页面识别到可用任务点。请先进入课程详情并展开右侧课程目录，再点击“重新扫描目录”。</div>';
        batchStartButton.disabled = true;
        return;
      }
      batchList.innerHTML = batchEntries.map((entry, index) => {
        const stateText = entry.state === 'current' ? '提取中' : entry.state === 'done' ? '已提取' : entry.state === 'failed' ? '已跳过' : '待提取';
        const stateClass = entry.state === 'current' ? ' is-current' : entry.state === 'done' ? ' is-done' : entry.state === 'failed' ? ' is-failed' : '';
        const meta = entry.detail || (entry.kind === 'taskpoint'
          ? `任务点 ${entry.knowledgeId}：开始后自动读取其中的章节测验任务`
          : `任务点 ${entry.taskPointId} · workId ${entry.workId}`);
        return `<label class="xxt-batch-item${stateClass}" data-batch-entry-id="${escapeHtml(entry.id)}">
          <input type="checkbox" data-batch-select="${index}"${entry.selected ? ' checked' : ''}${running ? ' disabled' : ''}>
          <span class="xxt-batch-item-main"><span class="xxt-batch-item-title">${escapeHtml(entry.label)}</span><span class="xxt-batch-item-meta">${escapeHtml(meta)}</span></span>
          <span class="xxt-batch-item-state">${stateText}</span>
        </label>`;
      }).join('');
      batchStartButton.disabled = running || !batchEntries.some(entry => entry.selected);
      batchStartButton.textContent = batchPausedRun ? '继续提取' : '开始提取';
    }

    function refreshBatchScan() {
      if (batchExtractionRun && batchExtractionRun.running) return;
      batchPausedRun = null;
      batchEntries = scanChapterTestEntries();
      batchNote.textContent = batchEntries.length
        ? `已识别 ${batchEntries.length} 个课程任务点。默认已全选；开始后会从每个任务点的真实任务列表中逐个提取章节测验。`
        : '未识别到课程任务点。请先展开课程目录；若目录在 iframe 中，确认其内容已经加载完成后再扫描。';
      updateBatchProgress(batchEntries.length ? `已选择 ${batchEntries.length} 个课程任务点` : '');
      renderBatchEntries();
    }

    // 批量切换采用固定、保守的节奏：先确认上一页已经完成，再让新页面有
    // 充足时间渲染。这里不伪造用户操作，也不会绕过页面验证码或其他限制。
    const BATCH_PACING = Object.freeze({
      minNavigationGapMs: 4200,
      navigationSettleMs: 1800,
      taskSwitchSettleMs: 1200,
      taskCooldownMs: 800,
      chapterCooldownMs: 1000,
      checkIntervalMs: 200
    });

    function batchSleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function waitForBatchRun(run, duration) {
      const deadline = Date.now() + Math.max(0, Number(duration) || 0);
      while (Date.now() < deadline) {
        if (run && (run.stopped || !batchExtractionRun || batchExtractionRun.id !== run.id)) return false;
        await batchSleep(Math.min(BATCH_PACING.checkIntervalMs, Math.max(1, deadline - Date.now())));
      }
      return !(run && (run.stopped || !batchExtractionRun || batchExtractionRun.id !== run.id));
    }

    async function waitForBatchNavigationGap(run) {
      const lastNavigationAt = Number(run && run.lastNavigationAt || 0);
      const remaining = Math.max(0, BATCH_PACING.minNavigationGapMs - (Date.now() - lastNavigationAt));
      if (remaining < 80) return !(run && run.stopped);
      appendBatchLog(`等待页面稳定：将在约 ${Math.ceil(remaining / 1000)} 秒后进入下一节。`);
      return waitForBatchRun(run, remaining);
    }

    function currentBatchQuestionSignature() {
      const top = extractFromRoot(document);
      if (hasQuestions(top)) return iframeDataSignature(top);
      return iframeDataSignature(window.__xxt_iframe_data);
    }

    function clearBatchVisibleTask(run) {
      if (run) run.activeFrame = null;
    }

    function collectBatchVisibleDocuments() {
      const docs = [];
      const seen = new Set();
      const visit = doc => {
        if (!doc || seen.has(doc)) return;
        seen.add(doc); docs.push(doc);
        try { Array.from(doc.querySelectorAll('iframe')).forEach(frame => visit(frame.contentDocument)); } catch (e) {}
      };
      visit(document);
      return docs;
    }

    function findBatchVisibleContentFrame() {
      const candidates = [];
      const visit = doc => {
        if (!doc) return;
        try {
          Array.from(doc.querySelectorAll('iframe:not([data-xxt-batch-frame])')).forEach(frame => {
            let rect = { width: 0, height: 0 };
            try { rect = frame.getBoundingClientRect(); } catch (e) {}
            const hint = `${frame.id} ${frame.name} ${frame.getAttribute('src') || ''}`.toLowerCase();
            const score = (rect.width > 180 && rect.height > 120 ? 10 : 0)
              + (/studentstudy|frame_content|content|work|main/.test(hint) ? 5 : 0)
              + (frame.offsetParent !== null ? 2 : 0);
            candidates.push({ frame, score });
            try { visit(frame.contentDocument); } catch (e) {}
          });
        } catch (e) {}
      };
      visit(document);
      candidates.sort((a, b) => b.score - a.score);
      return candidates[0] && candidates[0].frame;
    }

    function getBatchFrameJobId(frame) {
      let current = frame;
      for (let depth = 0; current && depth < 3; depth++, current = current.parentElement) {
        const raw = current.getAttribute && current.getAttribute('data') || '';
        try {
          const payload = JSON.parse(raw);
          const parsedJobId = payload && (payload.jobid || payload._jobid);
          if (parsedJobId) return String(parsedJobId);
        } catch (e) {}
        const match = raw.match(/["']?(?:jobid|_jobid)["']?\s*[=:]\s*["']?([^,"'}\s]+)["']?/i);
        if (match) return String(match[1]);
        try {
          const href = current.contentWindow && current.contentWindow.location.href || '';
          const params = new URL(href, location.href).searchParams;
          const jobId = params.get('jobId') || params.get('jobid');
          if (jobId) return String(jobId);
        } catch (e) {}
      }
      return '';
    }

    function findBatchTaskFrame(task) {
      const targetJobId = String(task && (task.jobId || task.attachment && (task.attachment.jobid || task.attachment.property && task.attachment.property._jobid) || '') || '');
      if (!targetJobId) return null;
      const frames = [];
      const visit = doc => {
        if (!doc) return;
        try {
          Array.from(doc.querySelectorAll('iframe:not([data-xxt-batch-frame])')).forEach(frame => {
            if (getBatchFrameJobId(frame) === targetJobId) frames.push(frame);
            try { visit(frame.contentDocument); } catch (e) {}
          });
        } catch (e) {}
      };
      visit(document);
      return frames[0] || null;
    }

    function findBatchTaskLink(task) {
      const workId = String(task && task.workId || '');
      const jobId = String(task && task.jobId || '');
      for (const doc of collectBatchVisibleDocuments()) {
        try {
          const link = Array.from(doc.querySelectorAll('a[href]')).find(anchor => {
            const href = anchor.getAttribute('href') || '';
            return (jobId && href.includes(jobId)) || (workId && href.includes(workId));
          });
          if (link) return link;
        } catch (e) {}
      }
      return null;
    }

    // 按课程页原生任务卡切换。每个 task 都在进入章节后直接从 .prev_ul li
    // 创建，因此不会把上一章节或 cards 接口推断出的 workId 错配到当前页。
    function findBatchNativeTaskTab(task) {
      const expectedChapterId = String(task && (task.taskPointId || task.knowledgeId) || '');
      const tabs = getBatchNativeTaskTabs({ knowledgeId: expectedChapterId });
      const exact = tabs.find(tabInfo =>
        (task && task.nativeTab && tabInfo.tab === task.nativeTab) ||
        (task && task.nativeTabSignature && tabInfo.signature === task.nativeTabSignature) ||
        (task && Number.isInteger(task.nativeTabIndex) && tabInfo.tabIndex === task.nativeTabIndex && isBatchChapterTestTab(tabInfo))
      );
      return exact || tabs.find(isBatchChapterTestTab) || null;
    }

    function isBatchNativeTaskActive(task) {
      const nativeTab = findBatchNativeTaskTab(task);
      const tab = nativeTab && nativeTab.tab;
      if (!tab) return false;
      try {
        return !!(tab.classList && (tab.classList.contains('active') || tab.classList.contains('cur') || tab.classList.contains('current'))) || tab.getAttribute('aria-selected') === 'true';
      } catch (e) {
        return false;
      }
    }

    async function activateBatchNativeTask(task) {
      const nativeTab = findBatchNativeTaskTab(task);
      if (!nativeTab) return false;
      const active = isBatchNativeTaskActive(task);
      if (!active) {
        let invoked = false;
        // 先点任务卡本身，完全复用学习通页面上的点击路径。
        try { nativeTab.tab.click(); invoked = true; } catch (e) {}
        const match = nativeTab.onclick.match(/changeDisplayContent\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*['"]?([^,'")]+)['"]?\s*,\s*['"]?([^,'")]+)['"]?\s*,\s*['"]?([^,'")]+)['"]?/i);
        if (!invoked && match) {
          for (const host of getBatchHostWindows()) {
            try {
              if (typeof host.changeDisplayContent !== 'function') continue;
              host.changeDisplayContent(Number(match[1]), Number(match[2]), match[3], match[4], match[5], '');
              invoked = true;
              break;
            } catch (e) {}
          }
        }
        if (!invoked) return false;
      }
      task.nativeTaskTab = nativeTab.tab;
      task.nativeTaskLabel = nativeTab.text;
      task.nativeWasActive = active;
      await batchSleep(350);
      return true;
    }

    async function navigateBatchVisibleTask(run, entry) {
      run.expectedTargetUrl = entry.targetUrl || '';
      run.navigationStartedAt = Date.now();
      const taskFrame = findBatchTaskFrame(entry);
      if (taskFrame) {
        run.activeFrame = taskFrame;
        return true;
      }
      if (await activateBatchNativeTask(entry)) return true;
      throw new Error('未在当前章节的原生任务卡中找到章节测验');
    }

    function isBatchVisibleNavigationReady(run) {
      if (!run) return false;
      if (!run.expectedTargetUrl) return !!(run.activeTask && isBatchNativeTaskActive(run.activeTask));
      let expected;
      try { expected = new URL(run.expectedTargetUrl, location.href); } catch (e) { return false; }
      const expectedWorkId = expected.searchParams.get('workId') || expected.searchParams.get('workid') || '';
      const expectedPath = expected.pathname.replace(/\/$/, '');
      if (run.activeFrame) {
        try {
          const href = run.activeFrame.contentWindow && run.activeFrame.contentWindow.location.href || '';
          const ready = !run.activeFrame.contentDocument || run.activeFrame.contentDocument.readyState === 'complete';
          if (ready && expectedWorkId && href.includes(expectedWorkId) && href.includes(expectedPath)) return true;
        } catch (e) {}
      }
      return collectBatchVisibleDocuments().some(doc => {
        try {
          const href = doc.defaultView && doc.defaultView.location.href || '';
          return href && href.includes(expectedPath) && (!expectedWorkId || href.includes(expectedWorkId));
        } catch (e) { return false; }
      });
    }

    function isBatchIframeMessageForRun(run) {
      if (!run) return false;
      if (!run.expectedTargetUrl) return !!(run.activeTask && isBatchNativeTaskActive(run.activeTask));
      const href = window.__xxt_iframe_context && window.__xxt_iframe_context.href || '';
      if (!href) return false;
      try {
        const expected = new URL(run.expectedTargetUrl, location.href);
        const expectedWorkId = expected.searchParams.get('workId') || expected.searchParams.get('workid') || '';
        const expectedPath = expected.pathname.replace(/\/$/, '');
        return href.includes(expectedPath) && (!expectedWorkId || href.includes(expectedWorkId));
      } catch (e) { return false; }
    }

    async function extractFromVisibleBatchPage() {
      const docs = collectBatchVisibleDocuments();
      // 内层题目页面优先，避免外层仍保留上一份题目的容器影响结果。
      for (let index = docs.length - 1; index >= 0; index--) {
        const doc = docs[index];
        try {
          await prepareFontCipherDecoder(doc);
          const result = extractFromRoot(doc);
          if (hasQuestions(result)) return result;
        } catch (e) {}
      }
      return emptyExtractResult();
    }

    async function extractFromBatchTaskFrame(frame) {
      if (!frame) return emptyExtractResult();
      try {
        const doc = frame.contentDocument;
        if (!doc) return emptyExtractResult();
        await prepareFontCipherDecoder(doc);
        return extractFromRoot(doc);
      } catch (e) { return emptyExtractResult(); }
    }

    async function waitForBatchVisibleQuestions(run, previousSignature, previousMessageAt, timeout = 30000) {
      const startedAt = Date.now();
      let nextRequestAt = 0;
      while (Date.now() - startedAt < timeout) {
        if (!batchExtractionRun || batchExtractionRun.id !== run.id || run.stopped) return emptyExtractResult();
        if (!run.activeFrame && run.activeTask) run.activeFrame = findBatchTaskFrame(run.activeTask);
        const direct = run.activeFrame
          ? await extractFromBatchTaskFrame(run.activeFrame)
          : await extractFromVisibleBatchPage();
        const directSignature = iframeDataSignature(direct);
        const freshMessage = (window.__xxt_last_iframe_message_at || 0) > previousMessageAt;
        if (hasQuestions(direct) && directSignature &&
            (run.activeFrame || directSignature !== previousSignature || freshMessage ||
             (run.activeTask && run.activeTask.nativeWasActive) ||
             (isBatchVisibleNavigationReady(run) && Date.now() - startedAt > 900))) return direct;
        const iframeData = window.__xxt_iframe_data;
        const iframeSignature = iframeDataSignature(iframeData);
        if (iframeData && hasQuestions(iframeData) && iframeSignature &&
            ((freshMessage && isBatchIframeMessageForRun(run)) || iframeSignature !== previousSignature)) return iframeData;
        if (Date.now() >= nextRequestAt) {
          requestIframeExtraction('', undefined, { batchRunId: run.id });
          nextRequestAt = Date.now() + 900;
        }
        await batchSleep(260);
      }
      return emptyExtractResult();
    }

    function mergeBatchChapterResult(run, source, entry) {
      const chapterData = createExtractedDataFromResults(source.results, source.typeOrder, entry.label);
      const temporaryBank = {
        id: 'batch-temporary', name: '批量章节测验', createdAt: '', updatedAt: '',
        results: run.results, typeOrder: run.typeOrder
      };
      const merged = mergeExtractedDataIntoBank(temporaryBank, chapterData);
      run.results = merged.bank.results;
      run.typeOrder = merged.bank.typeOrder;
      run.added += merged.added;
      run.skipped += merged.skipped;
      run.answersFilled += merged.answersFilled;
      return chapterData.total;
    }

    function stopBatchExtraction() {
      if (batchExtractionRun && batchExtractionRun.running) {
        batchExtractionRun.stopped = true;
        batchStopButton.disabled = true;
        appendBatchLog(`已请求暂停：当前已完成 ${batchExtractionRun.completed} 个章节测验，累计 ${batchQuestionCount(batchExtractionRun)} 题。`, 'warn');
        updateBatchProgress('正在暂停提取…', `已完成 ${batchExtractionRun.completed} 个测验，累计 ${batchQuestionCount(batchExtractionRun)} 题；当前任务会尽快安全停下。`, batchExtractionRun.nextIndex || 0, (batchExtractionRun.selectedTaskPoints || []).length);
      }
    }

    function resetBatchForRestart() {
      batchPausedRun = null;
      batchEntries.forEach(entry => {
        if (!entry.selected) return;
        entry.state = 'pending';
        entry.detail = '';
        entry.tasks = null;
        entry.nativeTaskScan = null;
        entry.cardScan = null;
      });
    }

    async function startBatchExtraction(options = {}) {
      if (batchExtractionRun && batchExtractionRun.running) return;
      const shouldResume = !!(options.resume && batchPausedRun);
      if (options.restart) resetBatchForRestart();
      let selectedTaskPoints;
      let startIndex = 0;
      let run;
      if (shouldResume) {
        run = batchPausedRun;
        batchPausedRun = null;
        selectedTaskPoints = Array.isArray(run.selectedTaskPoints) ? run.selectedTaskPoints : batchEntries.filter(entry => entry.selected);
        startIndex = Math.max(0, Math.min(Number(run.nextIndex) || 0, selectedTaskPoints.length));
        run.id = `batch-run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        run.running = true;
        run.stopped = false;
        run.activeFrame = null;
        run.activeTask = null;
      } else {
        selectedTaskPoints = batchEntries.filter(entry => entry.selected);
        run = {
          id: `batch-run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          running: true, stopped: false, results: Object.fromEntries(QUESTION_BANK_TYPES.map(type => [type, []])), typeOrder: [],
          added: 0, skipped: 0, answersFilled: 0, completed: 0, taskPointsCompleted: 0, failed: 0, activeFrame: null,
          selectedTaskPoints, nextIndex: 0, noTasks: false
        };
      }
      if (!selectedTaskPoints.length) return;
      run.selectedTaskPoints = selectedTaskPoints;
      run.nextIndex = startIndex;
      batchExtractionRun = run;
      if (!Array.isArray(run.logs)) run.logs = [];
      appendBatchLog(
        shouldResume
          ? `继续提取：将从第 ${startIndex + 1} / ${selectedTaskPoints.length} 章恢复。`
          : `开始提取：已选择 ${selectedTaskPoints.length} 个课程任务点。`
      );
      appendBatchLog(`保守节奏已开启：每次章节切换至少间隔 ${Math.round(BATCH_PACING.minNavigationGapMs / 1000)} 秒，确认切换后再额外等待页面稳定。`);
      els.btnBatchExtract.disabled = true;
      els.btnExtract.disabled = true;
      batchStopButton.classList.remove('xxt-hidden');
      batchStopButton.disabled = false;
      batchProgressCard.querySelector('[data-batch-card-stop]').classList.remove('xxt-hidden');
      batchStartButton.disabled = true;
      batchModal.classList.remove('open');
      showBatchProgressCard();
      updateBatchProgress(
        shouldResume ? `继续提取：从第 ${startIndex + 1} / ${selectedTaskPoints.length} 章开始` : `正在读取 ${selectedTaskPoints.length} 个任务点…`,
        `已完成 ${run.completed} 个测验，累计 ${batchQuestionCount(run)} 题；视频等非测验任务会自动跳过。`,
        startIndex, selectedTaskPoints.length
      );
      renderBatchEntries();

      const context = getBatchCourseContext();
      for (let index = startIndex; index < selectedTaskPoints.length; index++) {
        if (run.stopped) break;
        const entry = selectedTaskPoints[index];
        run.nextIndex = index;
        entry.state = 'current'; entry.detail = `正在按 knowledgeId ${entry.knowledgeId} 跳转任务点…`;
        appendBatchLog(`第 ${index + 1} / ${selectedTaskPoints.length} 章：正在进入“${entry.label}”。`);
        updateBatchProgress(
          `第 ${index + 1} / ${selectedTaskPoints.length} 章 · 正在读取任务卡`,
          `${entry.label} · 已完成 ${run.completed} 个测验，累计 ${batchQuestionCount(run)} 题。`,
          index, selectedTaskPoints.length
        );
        renderBatchEntries();
        try {
          // 首项按目录原生进入；后续项直接点页面底部“下一节”。若选中的
          // 章节不是相邻项或页面未响应，才回退到目录原生函数。
          let reached = false;
          if (index > startIndex && index > 0) {
            if (!await waitForBatchNavigationGap(run)) break;
            run.lastNavigationAt = Date.now();
            reached = await activateBatchNextTaskPoint(selectedTaskPoints[index - 1], entry, context);
          }
          if (!reached) {
            // 原生“下一节”不可用或未响应时，再用目录自己的导航函数回退；
            // 同样记录一次切换时间，避免连续触发课程页请求。
            run.lastNavigationAt = Date.now();
            reached = await activateBatchTaskPoint(entry, context);
          }
          if (!reached) throw new Error('无法通过课程原生导航进入该任务点');
          appendBatchLog(`第 ${index + 1} 章：已发出章节切换，正在等待页面稳定。`);
          if (!await waitForBatchRun(run, BATCH_PACING.navigationSettleMs)) break;
          const tasks = await resolveBatchTaskPointTasks(entry);
          if (!tasks.length) {
            entry.state = 'failed'; entry.detail = '已跳转到任务点，但未发现章节测验任务'; run.failed++; run.noTasks = true;
            appendBatchLog(`第 ${index + 1} 章：未发现“章节测验”任务卡，已跳过。`, 'warn');
            updateBatchProgress(`第 ${index + 1} / ${selectedTaskPoints.length} 个任务点未发现测验`, `${entry.label} · 请确认该任务点确实包含章节测验`, index + 1, selectedTaskPoints.length);
          } else {
            const scanned = entry.nativeTaskScan || {};
            const skippedCards = Math.max(0, Number(scanned.cards || tasks.length) - tasks.length);
            appendBatchLog(`第 ${index + 1} 章：识别 ${scanned.cards || tasks.length} 个原生任务卡，跳过 ${skippedCards} 个非测验任务，待提取 ${tasks.length} 个章节测验。`);
            for (let taskIndex = 0; taskIndex < tasks.length; taskIndex++) {
              if (run.stopped) break;
              const task = tasks[taskIndex];
              if (task.state === 'done') continue;
              run.activeTask = task;
              run.activeFrame = null;
              window.__xxt_ignore_iframe_signature = '';
              task.state = 'current';
              appendBatchLog(`第 ${index + 1} 章 · 本章第 ${taskIndex + 1} / ${tasks.length} 个测验：打开“${task.nativeTaskLabel || '章节测验'}”。`);
              entry.detail = `本章第 ${taskIndex + 1} / ${tasks.length} 个章节测验；总计已完成 ${run.completed} 个测验、${batchQuestionCount(run)} 题`;
              updateBatchProgress(
                `第 ${index + 1} / ${selectedTaskPoints.length} 章 · 本章第 ${taskIndex + 1} / ${tasks.length} 个测验`,
                `${entry.label} · 总计已完成 ${run.completed} 个测验，累计 ${batchQuestionCount(run)} 题。`,
                index, selectedTaskPoints.length
              );
              renderBatchEntries();
              let source = emptyExtractResult();
              const previousSignature = currentBatchQuestionSignature();
              const previousMessageAt = window.__xxt_last_iframe_message_at || 0;
              window.__xxt_iframe_data = null;
              window.__xxt_iframe_context = null;
              await navigateBatchVisibleTask(run, task);
              if (!await waitForBatchRun(run, BATCH_PACING.taskSwitchSettleMs)) break;
              source = await waitForBatchVisibleQuestions(run, previousSignature, previousMessageAt);
              if (run.stopped) break;
              if (!hasQuestions(source)) {
                run.failed++;
                task.state = 'failed';
                entry.detail = '章节测验任务卡已打开，但等待题目超时，已跳过';
                appendBatchLog(`第 ${index + 1} 章 · 本章第 ${taskIndex + 1} 个测验：题目加载超时，已跳过。`, 'warn');
              } else {
                const chapterTotal = mergeBatchChapterResult(run, source, task);
                run.completed++;
                task.state = 'done';
                entry.detail = `本章第 ${taskIndex + 1} / ${tasks.length} 个测验已提取 ${chapterTotal} 题；总计 ${run.completed} 个测验、${batchQuestionCount(run)} 题`;
                appendBatchLog(`第 ${index + 1} 章 · 本章第 ${taskIndex + 1} 个测验：已提取 ${chapterTotal} 题；累计 ${run.completed} 个测验、${batchQuestionCount(run)} 题。`);
                updateBatchProgress(
                  `第 ${index + 1} / ${selectedTaskPoints.length} 章 · 本章第 ${taskIndex + 1} / ${tasks.length} 个测验已完成`,
                  `${entry.label} · 总计已完成 ${run.completed} 个测验，累计 ${batchQuestionCount(run)} 题。`,
                  index, selectedTaskPoints.length
                );
              }
              renderBatchEntries();
              if (!run.stopped && taskIndex < tasks.length - 1) {
                if (!await waitForBatchRun(run, BATCH_PACING.taskCooldownMs)) break;
              }
            }
            if (run.stopped) {
              entry.state = 'pending';
              entry.detail = `已暂停：继续后从本章未完成的章节测验继续（当前已完成 ${run.completed} 个测验、${batchQuestionCount(run)} 题）`;
              appendBatchLog(`第 ${index + 1} 章：已安全暂停，继续后会从本章未完成的测验继续。`, 'warn');
            } else {
              entry.state = 'done';
              run.taskPointsCompleted++;
              run.nextIndex = index + 1;
              appendBatchLog(`第 ${index + 1} 章：该章章节测验处理完成。`);
            }
          }
        } catch (error) {
          entry.state = 'failed'; entry.detail = `任务点提取失败：${error && error.message ? error.message : error}`; run.failed++;
          run.nextIndex = index + 1;
          appendBatchLog(`第 ${index + 1} 章：提取异常，已跳过。${error && error.message ? `原因：${error.message}` : ''}`, 'error');
          updateBatchProgress(`第 ${index + 1} / ${selectedTaskPoints.length} 章未完成`, `${entry.label} · 已跳过并继续；总计已完成 ${run.completed} 个测验、${batchQuestionCount(run)} 题。`, index + 1, selectedTaskPoints.length);
        }
        clearBatchVisibleTask(run);
        run.activeTask = null;
        renderBatchEntries();
        if (!run.stopped && index < selectedTaskPoints.length - 1) {
          if (!await waitForBatchRun(run, BATCH_PACING.chapterCooldownMs)) break;
        }
      }

      run.running = false;
      clearBatchVisibleTask(run);
      batchStopButton.classList.add('xxt-hidden');
      els.btnBatchExtract.disabled = false;
      els.btnExtract.disabled = false;
      const data = createExtractedDataFromResults(run.results, run.typeOrder, `整门课章节测验（${run.completed}个测验）`);
      if (data.total > 0) {
        extractedData = data;
        resetExportQuestionSelection();
        renderStats(els); updateFilename(els); els.result.classList.remove('xxt-hidden'); syncExtractionOptionState(extractedData);
      }
      const summary = run.stopped
        ? `已停止：完成 ${run.completed} 个任务，累计 ${data.total} 题`
        : run.noTasks && run.completed === 0
          ? '所选任务点中未发现可提取的章节测验任务'
        : `批量提取完成：${run.completed} 个任务，累计 ${data.total} 题${run.failed ? `，跳过 ${run.failed} 个任务` : ''}`;
      if (run.stopped) batchPausedRun = run;
      appendBatchLog(run.stopped
        ? `批量提取已暂停：已完成 ${run.completed} 个章节测验，累计 ${data.total} 题；可继续或重新开始。`
        : `批量提取结束：已完成 ${run.completed} 个章节测验，累计 ${data.total} 题${run.failed ? `，跳过 ${run.failed} 个任务。` : '。'}`,
      run.stopped || run.failed ? 'warn' : '');
      const finalDetail = run.stopped
        ? `已保留已提取的 ${data.total} 题。点击“继续提取”从第 ${Math.min(run.nextIndex + 1, selectedTaskPoints.length)} / ${selectedTaskPoints.length} 章继续，或点击“重新开始”。`
        : `已按原生任务卡和页面底部“下一节”可见跳转；${run.skipped ? `去重 ${run.skipped} 题。` : '没有重复题目。'}`;
      updateBatchProgress(summary, finalDetail, run.stopped ? Math.min(run.nextIndex, selectedTaskPoints.length) : selectedTaskPoints.length, selectedTaskPoints.length);
      batchNote.textContent = summary + (run.skipped ? `；已自动去重 ${run.skipped} 题。` : '。');
      showStatus(els, summary, run.failed || run.stopped || (run.noTasks && run.completed === 0) ? 'warn' : 'ok');
      batchExtractionRun = null;
      batchProgressCard.querySelector('[data-batch-card-stop]').classList.add('xxt-hidden');
      renderBatchEntries();
    }

    els.btnBatchExtract.addEventListener('click', () => {
      if (batchPausedRun) {
        batchNote.textContent = `已暂停：完成 ${batchPausedRun.completed} 个测验，累计 ${batchQuestionCount(batchPausedRun)} 题。可继续提取，或重新扫描后重新开始。`;
      } else {
        refreshBatchScan();
      }
      batchModal.classList.add('open');
    });
    batchModal.querySelector('#xxt-batch-rescan').addEventListener('click', refreshBatchScan);
    batchModal.querySelector('#xxt-batch-select-all').addEventListener('click', () => {
      if (batchExtractionRun && batchExtractionRun.running) return;
      batchEntries.forEach(entry => { entry.selected = true; }); renderBatchEntries();
      updateBatchProgress(`已选择 ${batchEntries.length} 个课程任务点`);
    });
    batchModal.querySelector('#xxt-batch-select-none').addEventListener('click', () => {
      if (batchExtractionRun && batchExtractionRun.running) return;
      batchEntries.forEach(entry => { entry.selected = false; }); renderBatchEntries();
      updateBatchProgress('尚未选择课程任务点');
    });
    batchList.addEventListener('change', event => {
      const index = Number(event.target && event.target.dataset && event.target.dataset.batchSelect);
      if (!Number.isInteger(index) || !batchEntries[index] || (batchExtractionRun && batchExtractionRun.running)) return;
      batchEntries[index].selected = !!event.target.checked;
      updateBatchProgress(`已选择 ${batchEntries.filter(entry => entry.selected).length} 个课程任务点`);
      renderBatchEntries();
    });
    batchStartButton.addEventListener('click', () => startBatchExtraction({ resume: !!batchPausedRun }));
    batchStopButton.addEventListener('click', stopBatchExtraction);
    batchModal.querySelector('#xxt-batch-close').addEventListener('click', () => {
      if (batchExtractionRun && batchExtractionRun.running) stopBatchExtraction();
      else batchModal.classList.remove('open');
    });
    batchModal.addEventListener('click', event => {
      if (event.target === batchModal && !(batchExtractionRun && batchExtractionRun.running)) batchModal.classList.remove('open');
    });
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || !batchModal.classList.contains('open')) return;
      if (batchExtractionRun && batchExtractionRun.running) stopBatchExtraction();
      else batchModal.classList.remove('open');
    }, { signal: uiEventController.signal });
    batchProgressCard.querySelector('[data-batch-card-stop]').addEventListener('click', stopBatchExtraction);
    batchProgressCard.querySelector('[data-batch-card-close]').addEventListener('click', hideBatchProgressCard);
    els.batchLive.querySelector('[data-batch-live-stop]').addEventListener('click', stopBatchExtraction);
    els.batchLive.querySelector('[data-batch-live-resume]').addEventListener('click', () => startBatchExtraction({ resume: true }));
    els.batchLive.querySelector('[data-batch-live-restart]').addEventListener('click', () => startBatchExtraction({ restart: true }));

    // ==================== 独立题库区 ====================
    const bankModal = document.createElement('div');
    bankModal.id = 'xxt-bank-modal';
    bankModal.innerHTML = `
      <div class="xxt-bank-box">
        <div class="xxt-modal-header">
          <h3>📚 题库区</h3>
          <button class="xxt-modal-close" id="xxt-bank-close">&times;</button>
        </div>
        <div class="xxt-bank-toolbar">
          <select id="xxt-bank-select" aria-label="当前题库"></select>
          <button class="xxt-bank-btn" id="xxt-bank-new">＋新建</button>
          <button class="xxt-bank-btn" id="xxt-bank-rename">改名</button>
          <button class="xxt-bank-btn xxt-danger" id="xxt-bank-delete">删除</button>
        </div>
        <div class="xxt-bank-info" id="xxt-bank-info"></div>
        <div class="xxt-bank-toolbar">
          <button class="xxt-bank-btn" id="xxt-bank-load">载入到当前面板</button>
          <button class="xxt-bank-btn" id="xxt-bank-save-current">存入当前题目</button>
          <button class="xxt-bank-btn" id="xxt-bank-add-question">手动添加题目</button>
          <button class="xxt-bank-btn" id="xxt-bank-export-word">导出 Word</button>
          <button class="xxt-bank-btn" id="xxt-bank-export-txt">导出 TXT</button>
          <button class="xxt-bank-btn" id="xxt-bank-export-md">导出 MD</button>
          <button class="xxt-bank-btn" id="xxt-bank-export-pdf">导出 PDF</button>
          <button class="xxt-bank-btn" id="xxt-bank-import">导入 JSON</button>
          <button class="xxt-bank-btn xxt-danger" id="xxt-bank-clear">清空当前库</button>
          <input id="xxt-bank-file" type="file" accept=".json,application/json" style="display:none">
        </div>
        <div class="xxt-bank-search"><input id="xxt-bank-search-input" type="text" placeholder="搜索当前题库的题干、选项或答案"><button class="xxt-bank-btn" id="xxt-bank-search-btn">检索</button></div>
        <div class="xxt-bank-list" id="xxt-bank-list"></div>
        <div class="xxt-bank-compare">
          <button class="xxt-bank-btn" id="xxt-bank-compare-btn">将当前页面与题库对比</button>
          <label style="font-size:11px;color:var(--xxt-text-soft);">匹配阈值 <input id="xxt-bank-threshold" type="number" min="50" max="100" step="1" value="${currentSettings.bankThreshold}" style="width:58px">%</label>
          <div class="xxt-bank-compare-status" id="xxt-bank-compare-status"></div>
        </div>
      </div>
    `;
    document.body.appendChild(bankModal);
    enableXxtDragging(bankModal.querySelector('.xxt-bank-box'), bankModal.querySelector('.xxt-modal-header'), 'bank');

    // 面板中的“存入题库”先让用户明确选择目标题库，避免把题目直接写入
    // 上一次使用的题库；也可以在此一步新建题库后立即存入。
    const saveBankModal = document.createElement('div');
    saveBankModal.id = 'xxt-save-bank-modal';
    saveBankModal.innerHTML = `
      <form class="xxt-save-bank-box" id="xxt-save-bank-form" role="dialog" aria-modal="true" aria-labelledby="xxt-save-bank-title">
        <div class="xxt-modal-header">
          <h3 id="xxt-save-bank-title">存入题库</h3>
          <button type="button" class="xxt-modal-close" id="xxt-save-bank-close" aria-label="关闭">&times;</button>
        </div>
        <div class="xxt-save-bank-summary" id="xxt-save-bank-summary"></div>
        <div class="xxt-save-bank-mode" role="group" aria-label="存入方式">
          <button type="button" data-save-bank-mode="existing">存入已有题库</button>
          <button type="button" data-save-bank-mode="new">新建题库</button>
        </div>
        <div id="xxt-save-bank-existing">
          <div class="xxt-save-bank-field">
            <label for="xxt-save-bank-select">选择目标题库</label>
            <select id="xxt-save-bank-select" aria-label="目标题库"></select>
          </div>
        </div>
        <div id="xxt-save-bank-new" class="xxt-hidden">
          <div class="xxt-save-bank-field">
            <label for="xxt-save-bank-name">新题库名称</label>
            <input id="xxt-save-bank-name" type="text" maxlength="80" autocomplete="off" placeholder="例如：高等数学期末复习">
          </div>
        </div>
        <div class="xxt-save-bank-hint" id="xxt-save-bank-hint"></div>
        <div class="xxt-save-bank-actions">
          <button type="button" class="xxt-save-bank-cancel" id="xxt-save-bank-cancel">取消</button>
          <button type="submit" class="xxt-save-bank-confirm" id="xxt-save-bank-confirm">确认存入</button>
        </div>
      </form>
    `;
    document.body.appendChild(saveBankModal);
    enableXxtDragging(saveBankModal.querySelector('.xxt-save-bank-box'), saveBankModal.querySelector('.xxt-modal-header'), 'saveBank');
    const saveBankForm = saveBankModal.querySelector('#xxt-save-bank-form');
    const saveBankSummary = saveBankModal.querySelector('#xxt-save-bank-summary');
    const saveBankSelect = saveBankModal.querySelector('#xxt-save-bank-select');
    const saveBankExisting = saveBankModal.querySelector('#xxt-save-bank-existing');
    const saveBankNew = saveBankModal.querySelector('#xxt-save-bank-new');
    const saveBankNameInput = saveBankModal.querySelector('#xxt-save-bank-name');
    const saveBankHint = saveBankModal.querySelector('#xxt-save-bank-hint');
    const saveBankConfirm = saveBankModal.querySelector('#xxt-save-bank-confirm');
    const saveBankModeButtons = Array.from(saveBankModal.querySelectorAll('[data-save-bank-mode]'));

    const bankSelect = bankModal.querySelector('#xxt-bank-select');
    const bankInfo = bankModal.querySelector('#xxt-bank-info');
    const bankList = bankModal.querySelector('#xxt-bank-list');
    const bankSearchInput = bankModal.querySelector('#xxt-bank-search-input');
    const bankCompareStatus = bankModal.querySelector('#xxt-bank-compare-status');
    const BANK_PAGE_SIZE = 20;
    let bankSearchText = '';
    let bankCurrentPage = 1;
    let saveBankMode = 'existing';
    const bankTypeLabels = { '单选': '单选题', '多选': '多选题', '填空': '填空题', '判断': '判断题', '简答': '简答题' };

    function downloadQuestionBankFile(blob, filename) {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = String(filename || '学习通题库').replace(/[\\/:*?"<>|]/g, '_');
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    async function exportActiveQuestionBank(format, button) {
      const bank = getActiveQuestionBank();
      if (!bank || !bankQuestionCount(bank)) {
        showStatus(els, '当前题库为空，暂无可导出的题目', 'warn');
        return;
      }

      const originalText = button.textContent;
      const startedAt = Date.now();
      let progressTimer = null;
      button.disabled = true;
      button.textContent = format === 'pdf' ? '生成中...' : '导出中...';
      try {
        const data = buildExtractedDataFromBank(bank);
        const isBankImport = format === 'word' && !!(els.chkBankImport && els.chkBankImport.checked);
        const withAnswers = !!data.hasCorrectAnswer && !!(els.chkAnswers && els.chkAnswers.checked);
        const doShuffle = !isBankImport && !!(els.chkShuffle && els.chkShuffle.checked);
        const activeResults = doShuffle ? shuffleQuestions(data.results, data.typeOrder) : data.results;
        const baseFilename = String(bank.name || '学习通题库').replace(/[\\/:*?"<>|]/g, '_').substring(0, 60) || '学习通题库';

        if (format === 'pdf') {
          await generatePdf(activeResults, data.typeOrder, data.title, withAnswers, false, `${baseFilename}.pdf`);
          addToHistory(data, 'pdf', withAnswers, false, doShuffle, false, '');
          showStatus(els, '题库 PDF 已下载', 'ok');
          return;
        }

        if (format === 'word') {
          window.__xxt_failed_image_count = 0;
          // 题库和当前页统一导出原生 .docx，计时只反映真实的 DOCX 打包过程。
          button.textContent = '生成 Word（' + data.total + ' 题）...';
          progressTimer = setInterval(() => {
            const seconds = Math.max(1, Math.floor((Date.now() - startedAt) / 1000));
            button.textContent = '生成 Word（' + data.total + ' 题，' + seconds + 's）...';
          }, 1000);
          const blob = await generateWordBlob(
            activeResults, data.typeOrder, data.title,
            isBankImport || withAnswers, false, isBankImport
          );
          if (!(blob instanceof Blob) || blob.size < 100) throw new Error('Word 文档生成结果无效，请重试');
          downloadQuestionBankFile(blob, `${baseFilename}.docx`);
          const failedImages = window.__xxt_failed_image_count || 0;
          addToHistory(data, 'word', isBankImport || withAnswers, false, doShuffle, isBankImport, '');
          showStatus(els, '题库 Word 已下载（' + data.total + ' 题，.docx）' + (failedImages ? '；' + failedImages + ' 张图片加载失败' : ''), failedImages ? 'warn' : 'ok');
          return;
        }

        const isMarkdown = format === 'md';
        const text = withAnswers
          ? (isMarkdown ? formatOutputWithAnswersMD(activeResults, data.typeOrder) : formatOutputWithAnswers(activeResults, data.typeOrder))
          : (isMarkdown ? formatOutputMD(activeResults, data.typeOrder) : formatOutput(activeResults, data.typeOrder));
        downloadQuestionBankFile(
          new Blob([text], { type: isMarkdown ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8' }),
          `${baseFilename}.${isMarkdown ? 'md' : 'txt'}`
        );
        addToHistory(data, format, withAnswers, false, doShuffle, false, text);
        showStatus(els, `题库 ${isMarkdown ? 'MD' : 'TXT'} 已下载`, 'ok');
      } catch (error) {
        showStatus(els, `题库导出失败：${error && error.message ? error.message : error}`, 'err');
      } finally {
        if (progressTimer) clearInterval(progressTimer);
        button.disabled = false;
        button.textContent = originalText;
      }
    }

    function isSupportedQuestionBankImport(raw) {
      if (Array.isArray(raw)) return true;
      if (!raw || typeof raw !== 'object') return false;
      if (raw.bank || Array.isArray(raw.banks) || Array.isArray(raw.questions) || Array.isArray(raw.results) || Array.isArray(raw.items)) return true;
      return Object.values(raw).some(value => Array.isArray(value));
    }

    function uniqueImportedBankName(state, requestedName) {
      const base = String(requestedName || '导入题库').trim().substring(0, 80) || '导入题库';
      if (!state.banks.some(bank => bank.name === base)) return base;
      let suffix = 2;
      while (suffix < 10000) {
        const postfix = `（${suffix++}）`;
        const candidate = `${base.substring(0, Math.max(1, 80 - postfix.length))}${postfix}`;
        if (!state.banks.some(bank => bank.name === candidate)) return candidate;
      }
      return `导入题库-${Date.now()}`;
    }

    function normalizeBankComparableText(value) {
      return String(value || '')
        .replace(/^\s*\d+\s*[.、．]\s*/, '')
        .replace(/[（(\[【]\s*(?:单选|多选|判断|填空|简答|名词解释|论述|计算|配伍|案例|问答)\s*题?\s*[）)\]】]\s*/gi, '')
        .replace(/[\s\p{P}\p{S}]/gu, '')
        .toLowerCase()
        // 限制比较长度，避免“50 道页面题 × 数千道题库题”触发巨量矩阵计算。
        .slice(0, 360);
    }

    function bankBigramSimilarity(left, right) {
      const counts = new Map();
      for (let i = 0; i < left.length - 1; i++) {
        const gram = left.slice(i, i + 2); counts.set(gram, (counts.get(gram) || 0) + 1);
      }
      let intersection = 0;
      for (let i = 0; i < right.length - 1; i++) {
        const gram = right.slice(i, i + 2);
        if (counts.get(gram)) { intersection++; counts.set(gram, counts.get(gram) - 1); }
      }
      const total = Math.max(1, left.length + right.length - 2 - intersection);
      return intersection / total;
    }

    function bankSimilarityText(a, b) {
      const left = normalizeBankComparableText(a);
      const right = normalizeBankComparableText(b);
      if (!left && !right) return 1;
      if (!left || !right) return 0;
      if (left === right) return 1;
      const maxLength = Math.max(left.length, right.length);
      const bigramScore = bankBigramSimilarity(left, right);
      const containedScore = left.includes(right) || right.includes(left)
        ? Math.min(left.length, right.length) / maxLength * .2 : 0;
      // 低相似候选直接返回快速分数；大题库对比时绝大部分题目都会在这里结束。
      if (bigramScore < .12 && !containedScore) return bigramScore * .55;
      const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
      const current = new Array(right.length + 1);
      for (let i = 1; i <= left.length; i++) {
        current[0] = i;
        for (let j = 1; j <= right.length; j++) {
          const cost = left[i - 1] === right[j - 1] ? 0 : 1;
          current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
        }
        for (let j = 0; j <= right.length; j++) previous[j] = current[j];
      }
      const levenshteinScore = 1 - previous[right.length] / maxLength;
      return Math.min(1, levenshteinScore * .72 + bigramScore * .28 + containedScore);
    }

    function questionSimilarity(type, pageQuestion, bankQuestion) {
      const stemScore = bankSimilarityText(richTextOnly(questionContent(pageQuestion)), richTextOnly(questionContent(bankQuestion)));
      if (stemScore < .6) return stemScore * .8;
      const pageOptions = (pageQuestion.options || []).map(option => richTextOnly(optionContent(option))).join('|');
      const bankOptions = (bankQuestion.options || []).map(option => richTextOnly(optionContent(option))).join('|');
      const optionScore = pageOptions || bankOptions ? bankSimilarityText(pageOptions, bankOptions) : 1;
      return stemScore * .8 + optionScore * .2;
    }

    function renderBankSelector() {
      const state = loadQuestionBankState(true);
      const active = state.banks.find(bank => bank.id === state.activeBankId) || state.banks[0];
      bankSelect.innerHTML = state.banks.map(bank => `<option value="${escapeHtml(bank.id)}"${active && bank.id === active.id ? ' selected' : ''}>${escapeHtml(bank.name)}（${bankQuestionCount(bank)}题）</option>`).join('');
      const count = active ? bankQuestionCount(active) : 0;
      bankInfo.textContent = active ? `当前题库：${active.name} · ${count} 道题 · ${state.banks.length} 个题库 · 更新时间 ${new Date(active.updatedAt).toLocaleString('zh-CN')}` : '暂无题库';
    }

    function bankContentDisplayText(content, fallback = '') {
      const source = hasRichContent(content) ? content : [];
      const text = richContentToText(source, (url, part) => {
        const alt = String((part && part.alt) || '').replace(/\s+/g, ' ').trim();
        return '\n[图片' + (alt ? '：' + alt : '') + ']\n';
      }).replace(/\n{3,}/g, '\n\n').trim();
      return text || String(fallback || '').trim();
    }

    function bankTextToHtml(value, emptyText = '') {
      const text = String(value || '').trim();
      return text
        ? escapeHtml(text).replace(/\r\n?|\n/g, '<br>')
        : '<span class="xxt-bank-muted">' + escapeHtml(emptyText) + '</span>';
    }

    function renderBankQuestionCard(type, question, index) {
      const options = Array.isArray(question.options) ? question.options : [];
      const stem = bankContentDisplayText(questionContent(question), question.stem);
      const answer = bankContentDisplayText(answerContent(question), question.correctAnswer);
      const optionRows = options.map((option, optionIndex) => {
        const letter = String(option && option.letter || String.fromCharCode(65 + optionIndex)).trim().toUpperCase() || String.fromCharCode(65 + optionIndex);
        const text = bankContentDisplayText(optionContent(option || {}), option && option.text);
        return '<div class="xxt-bank-option"><span class="xxt-bank-option-letter">' + escapeHtml(letter) + '.</span><span class="xxt-bank-option-text">' + bankTextToHtml(text, '选项内容为空') + '</span></div>';
      }).join('');
      const optionBlock = options.length
        ? '<div class="xxt-bank-options"><div class="xxt-bank-options-label">选项</div>' + optionRows + '</div>'
        : '<div class="xxt-bank-no-options">本题没有可选项</div>';
      const meta = options.length ? options.length + ' 个选项' : '无选项';
      return '<article class="xxt-bank-card" data-bank-type="' + escapeHtml(type) + '" data-bank-index="' + index + '">' +
        '<div class="xxt-bank-card-head"><span class="xxt-bank-card-number">第 ' + (index + 1) + ' 题</span><span class="xxt-bank-card-meta">' + meta + '</span></div>' +
        '<div class="xxt-bank-question-stem">' + bankTextToHtml(stem, '题干内容为空') + '</div>' +
        optionBlock +
        '<div class="xxt-bank-answer"><span class="xxt-bank-answer-label">答案</span><span class="xxt-bank-answer-value">' + bankTextToHtml(answer, '未提取到答案') + '</span></div>' +
        '<div class="xxt-bank-card-actions"><button data-bank-action="edit">编辑</button><button data-bank-action="load">载入本题</button><button data-bank-action="delete" class="xxt-danger">删除</button></div>' +
        '</article>';
    }

    function renderBankList() {
      const active = getActiveQuestionBank();
      if (!active) { bankList.innerHTML = '<div class="xxt-bank-empty">暂无题库</div>'; return; }
      const query = bankSearchText.trim().toLowerCase();
      const rows = [];
      const matchedTypeCounts = Object.fromEntries(QUESTION_BANK_TYPES.map(type => [type, 0]));
      QUESTION_BANK_TYPES.forEach(type => {
        (active.results[type] || []).forEach((question, index) => {
          const searchable = [richTextOnly(questionContent(question)), ...(question.options || []).map(option => richTextOnly(optionContent(option))), richTextOnly(answerContent(question))].join(' ').toLowerCase();
          if (query && !searchable.includes(query)) return;
          matchedTypeCounts[type]++;
          rows.push({ type, question, index });
        });
      });
      if (!rows.length) { bankList.innerHTML = '<div class="xxt-bank-empty">当前题库暂无匹配题目</div>'; return; }
      const totalPages = Math.max(1, Math.ceil(rows.length / BANK_PAGE_SIZE));
      bankCurrentPage = Math.max(1, Math.min(totalPages, bankCurrentPage));
      const start = (bankCurrentPage - 1) * BANK_PAGE_SIZE;
      const pageRows = rows.slice(start, start + BANK_PAGE_SIZE);
      const groups = QUESTION_BANK_TYPES.map(type => {
        const typeRows = pageRows.filter(row => row.type === type);
        if (!typeRows.length) return '';
        const total = matchedTypeCounts[type];
        const totalLabel = (query ? '匹配 ' : '共 ') + total + ' 题';
        const countLabel = typeRows.length === total ? totalLabel : '本页 ' + typeRows.length + ' / ' + totalLabel;
        return '<section class="xxt-bank-type-group"><div class="xxt-bank-type-head"><span class="xxt-bank-type-title">' +
          escapeHtml(bankTypeLabels[type] || type) + '</span><span class="xxt-bank-type-count">' + countLabel + '</span></div>' +
          typeRows.map(row => renderBankQuestionCard(row.type, row.question, row.index)).join('') + '</section>';
      }).join('');
      const pagination = totalPages > 1
        ? '<div class="xxt-bank-pagination"><button data-bank-page="prev"' + (bankCurrentPage === 1 ? ' disabled' : '') + '>上一页</button><span>第 ' + bankCurrentPage + ' / ' + totalPages + ' 页 · ' + rows.length + ' 题</span><button data-bank-page="next"' + (bankCurrentPage === totalPages ? ' disabled' : '') + '>下一页</button></div>'
        : '<div class="xxt-bank-pagination"><span>共 ' + rows.length + ' 题</span></div>';
      bankList.innerHTML = groups + pagination;
    }

    function refreshBankModal(resetPage = false) {
      if (resetPage) bankCurrentPage = 1;
      renderBankSelector(); renderBankList();
    }

    function getCurrentExtractedQuestionCount() {
      return Object.values((extractedData && extractedData.results) || {}).reduce((sum, list) =>
        sum + (Array.isArray(list) ? list.length : 0), 0);
    }

    function updateSaveBankHint() {
      const isNew = saveBankMode === 'new';
      saveBankExisting.classList.toggle('xxt-hidden', isNew);
      saveBankNew.classList.toggle('xxt-hidden', !isNew);
      saveBankModeButtons.forEach(button => button.classList.toggle('active', button.dataset.saveBankMode === saveBankMode));
      saveBankConfirm.textContent = isNew ? '新建并存入' : '确认存入';

      if (!isNew) {
        const option = saveBankSelect.options[saveBankSelect.selectedIndex];
        const name = option ? option.textContent.replace(/（\d+题）$/, '') : '';
        saveBankConfirm.disabled = !saveBankSelect.value;
        saveBankHint.textContent = name
          ? `将保存到“${name}”。重复题目会自动跳过，已有题目的缺失答案会自动补齐。`
          : '请先选择一个目标题库。';
        return;
      }

      const name = saveBankNameInput.value.trim().substring(0, 80);
      const state = loadQuestionBankState();
      const duplicated = !!name && state.banks.some(bank => bank.name === name);
      saveBankConfirm.disabled = !name || duplicated;
      saveBankHint.textContent = !name
        ? '请输入新题库名称。'
        : duplicated
          ? `“${name}”已存在；请改用已有题库，或输入其他名称。`
          : `将先新建“${name}”，再把当前页面题目存入其中。`;
    }

    function setSaveBankMode(mode, focus = false) {
      saveBankMode = mode === 'new' ? 'new' : 'existing';
      updateSaveBankHint();
      if (focus) setTimeout(() => (saveBankMode === 'new' ? saveBankNameInput : saveBankSelect).focus(), 0);
    }

    function refreshSaveBankDialog() {
      const state = loadQuestionBankState(true);
      const active = state.banks.find(bank => bank.id === state.activeBankId) || state.banks[0];
      saveBankSelect.innerHTML = state.banks.map(bank =>
        `<option value="${escapeHtml(bank.id)}">${escapeHtml(bank.name)}（${bankQuestionCount(bank)}题）</option>`
      ).join('');
      if (active) saveBankSelect.value = active.id;
      const suggestedName = String((extractedData && extractedData.title) || '').replace(/\s+/g, ' ').trim().substring(0, 80);
      saveBankNameInput.value = suggestedName || `题库${state.banks.length + 1}`;
      saveBankSummary.textContent = `当前将存入 ${getSelectedQuestionCount()} / ${getCurrentExtractedQuestionCount()} 道题。请选择目标题库，或新建题库后再存入。`;
      setSaveBankMode('existing');
    }

    function openSaveCurrentToBankDialog() {
      if (!extractedData || !hasQuestions(extractedData)) {
        showStatus(els, '请先提取题目，再存入题库', 'warn');
        return;
      }
      if (getSelectedQuestionCount() === 0) {
        showStatus(els, '当前没有勾选题目，请先在“查看、编辑 / 选择题目”中选择', 'warn');
        return;
      }
      refreshSaveBankDialog();
      saveBankModal.classList.add('open');
      setTimeout(() => saveBankSelect.focus(), 0);
    }

    function saveCurrentToBank(targetBankId = '', newBankName = '') {
      if (!extractedData || !hasQuestions(extractedData)) {
        showStatus(els, '请先提取题目，再存入题库', 'warn');
        return null;
      }
      const sourceData = getSelectedExtractedData();
      if (!sourceData || !hasQuestions(sourceData)) {
        showStatus(els, '当前没有勾选题目，请至少选择 1 道题', 'warn');
        return null;
      }
      const state = loadQuestionBankState();
      const name = String(newBankName || '').trim().substring(0, 80);
      let active = null;
      let created = false;
      if (name) {
        if (state.banks.some(bank => bank.name === name)) {
          showStatus(els, `题库“${name}”已存在，请选择该题库或换一个名称`, 'warn');
          return null;
        }
        active = makeEmptyQuestionBank(name);
        state.banks.push(active);
        created = true;
      } else {
        active = state.banks.find(bank => bank.id === (targetBankId || state.activeBankId));
      }
      if (!active) {
        showStatus(els, '请先新建或选择题库', 'warn');
        return null;
      }
      try {
        const result = mergeExtractedDataIntoBank(active, sourceData);
        state.banks = state.banks.map(bank => bank.id === active.id ? result.bank : bank);
        state.activeBankId = active.id;
        saveQuestionBankState(state);
        refreshBankModal();
        const summary = `新增 ${result.added} 题，跳过 ${result.skipped} 题${result.answersFilled ? `，补齐 ${result.answersFilled} 个答案` : ''}`;
        showStatus(els, created ? `已新建题库“${active.name}”并存入：${summary}` : `已存入“${active.name}”：${summary}`, 'ok');
        return { bank: result.bank, result, created };
      } catch (error) {
        showStatus(els, `题库存储失败：${error.message}`, 'err');
        return null;
      }
    }

    function loadBankIntoPanel(bankOrData) {
      if (!bankOrData) return;
      extractedData = bankOrData.results ? (bankOrData.title ? refreshExtractedOutputCache(bankOrData) : buildExtractedDataFromBank(bankOrData)) : buildExtractedDataFromBank(bankOrData);
      resetExportQuestionSelection();
      renderStats(els); updateFilename(els); els.result.classList.remove('xxt-hidden'); syncExtractionOptionState(extractedData);
      els.btnExtract.textContent = '重新提取';
      bankModal.classList.remove('open');
      showStatus(els, `已载入题库“${bankOrData.name || extractedData.title}”，共 ${extractedData.total} 道题`, 'ok');
    }

    function openBankEditor(bank, type, index) {
      if (!bank) return;
      const isSingleQuestion = QUESTION_BANK_TYPES.includes(type) && Number.isInteger(index) && bank.results[type] && bank.results[type][index];
      const data = isSingleQuestion
        ? createExtractedDataFromResults({ [type]: [bank.results[type][index]] }, [type], `${bank.name}-${type}`)
        : buildExtractedDataFromBank(bank);
      const session = isSingleQuestion
        ? { kind: 'bankQuestion', bankId: bank.id, bankName: bank.name, type, index }
        : { kind: 'bank', bankId: bank.id, bankName: bank.name };
      bankModal.classList.remove('open');
      renderEditor(data, session);
      editorModal.classList.add('open');
    }

    function compareCurrentPageWithBank() {
      if (!extractedData || !hasQuestions(extractedData)) { bankCompareStatus.textContent = '请先在当前页面提取题目。'; return; }
      const active = getActiveQuestionBank();
      if (!active || !bankQuestionCount(active)) { bankCompareStatus.textContent = '当前题库为空，请先存入或导入题目。'; return; }
      const thresholdInput = bankModal.querySelector('#xxt-bank-threshold');
      const thresholdValue = Math.max(50, Math.min(100, Number(thresholdInput.value) || currentSettings.bankThreshold));
      thresholdInput.value = thresholdValue;
      currentSettings.bankThreshold = thresholdValue;
      saveSettings(currentSettings);
      const threshold = thresholdValue / 100;
      const bankQuestions = QUESTION_BANK_TYPES.flatMap(type => (active.results[type] || []).map(question => ({ type, question })));
      const pageQuestionCount = Object.values(extractedData.results).reduce((sum, list) => sum + list.length, 0);
      const lines = [`当前页 ${pageQuestionCount} 题 · 题库 ${bankQuestions.length} 题 · 阈值 ${(threshold * 100).toFixed(0)}%`];
      let matched = 0;
      QUESTION_BANK_TYPES.forEach(type => (extractedData.results[type] || []).forEach((question, index) => {
        const candidates = bankQuestions.filter(item => item.type === type);
        let best = { score: 0, question: null };
        candidates.forEach(item => { const score = questionSimilarity(type, question, item.question); if (score > best.score) best = { score, question: item.question }; });
        if (best.score >= threshold) { matched++; lines.push(`✓ ${type}第${index + 1}题 ${(best.score * 100).toFixed(1)}%：${richTextOnly(questionContent(question)).substring(0, 70)}`); }
        else {
          const candidate = best.question ? ` · 最佳候选 ${(best.score * 100).toFixed(1)}%：${richTextOnly(questionContent(best.question)).substring(0, 45)}` : '';
          lines.push(`✗ ${type}第${index + 1}题 未匹配：${richTextOnly(questionContent(question)).substring(0, 70)}${candidate}`);
        }
      }));
      lines.unshift(`匹配 ${matched} 题，未匹配 ${Math.max(0, pageQuestionCount - matched)} 题`);
      bankCompareStatus.textContent = lines.join('\n');
    }

    bankModal.querySelector('#xxt-bank-select').addEventListener('change', event => {
      try { setActiveQuestionBank(event.target.value); refreshBankModal(true); }
      catch (error) { showStatus(els, `切换题库失败：${error.message}`, 'err'); refreshBankModal(true); }
    });
    bankModal.querySelector('#xxt-bank-new').addEventListener('click', () => {
      const name = prompt('请输入题库名称：', `题库${loadQuestionBankState().banks.length + 1}`);
      if (!name || !name.trim()) return;
      const state = loadQuestionBankState();
      if (state.banks.some(bank => bank.name === name.trim())) { showStatus(els, '已存在同名题库', 'warn'); return; }
      const bank = makeEmptyQuestionBank(name.trim()); state.banks.push(bank); state.activeBankId = bank.id;
      try { saveQuestionBankState(state); refreshBankModal(); } catch (error) { showStatus(els, `新建失败：${error.message}`, 'err'); }
    });
    bankModal.querySelector('#xxt-bank-rename').addEventListener('click', () => {
      const bank = getActiveQuestionBank(); if (!bank) return;
      const name = prompt('请输入新的题库名称：', bank.name);
      if (!name || !name.trim() || name.trim() === bank.name) return;
      const state = loadQuestionBankState();
      if (state.banks.some(item => item.id !== bank.id && item.name === name.trim())) { showStatus(els, '已存在同名题库', 'warn'); return; }
      bank.name = name.trim().substring(0, 80); bank.updatedAt = new Date().toISOString();
      try { saveQuestionBankState(state); refreshBankModal(); } catch (error) { showStatus(els, `改名失败：${error.message}`, 'err'); }
    });
    bankModal.querySelector('#xxt-bank-delete').addEventListener('click', () => {
      const state = loadQuestionBankState(); const bank = getActiveQuestionBank(); if (!bank) return;
      if (state.banks.length <= 1) { showStatus(els, '至少保留一个题库；可以清空题库内容', 'warn'); return; }
      if (!confirm(`确定删除“${bank.name}”及其中的 ${bankQuestionCount(bank)} 道题吗？`)) return;
      state.banks = state.banks.filter(item => item.id !== bank.id); state.activeBankId = state.banks[0].id;
      try { saveQuestionBankState(state); refreshBankModal(); } catch (error) { showStatus(els, `删除失败：${error.message}`, 'err'); }
    });
    bankModal.querySelector('#xxt-bank-load').addEventListener('click', () => loadBankIntoPanel(getActiveQuestionBank()));
    bankModal.querySelector('#xxt-bank-save-current').addEventListener('click', () => saveCurrentToBank());
    bankModal.querySelector('#xxt-bank-add-question').addEventListener('click', () => {
      const bank = getActiveQuestionBank();
      if (!bank) return;
      const rawType = prompt('题型（单选、多选、填空、判断、简答）：', '单选');
      if (rawType === null) return;
      const type = QUESTION_BANK_TYPES.includes(rawType.trim()) ? rawType.trim() : detectTypeFromText(rawType);
      if (!type || !QUESTION_BANK_TYPES.includes(type)) {
        showStatus(els, '题型无效，请输入：单选、多选、填空、判断或简答', 'warn');
        return;
      }
      const blankQuestion = { stem: '', stemContent: [], options: [], correctAnswer: '', correctAnswerContent: [], myAnswer: '', isWrong: false };
      bankModal.classList.remove('open');
      renderEditor(createExtractedDataFromResults({ [type]: [blankQuestion] }, [type], `${bank.name}-${type}`), {
        kind: 'bankNewQuestion', bankId: bank.id, bankName: bank.name, type
      });
      editorModal.classList.add('open');
    });
    bankModal.querySelector('#xxt-bank-export-word').addEventListener('click', event => exportActiveQuestionBank('word', event.currentTarget));
    bankModal.querySelector('#xxt-bank-export-txt').addEventListener('click', event => exportActiveQuestionBank('txt', event.currentTarget));
    bankModal.querySelector('#xxt-bank-export-md').addEventListener('click', event => exportActiveQuestionBank('md', event.currentTarget));
    bankModal.querySelector('#xxt-bank-export-pdf').addEventListener('click', event => exportActiveQuestionBank('pdf', event.currentTarget));
    bankModal.querySelector('#xxt-bank-clear').addEventListener('click', () => {
      const state = loadQuestionBankState(); const bank = getActiveQuestionBank(); if (!bank) return;
      const count = bankQuestionCount(bank);
      if (!count) { showStatus(els, '当前题库已经为空', 'warn'); return; }
      if (!confirm(`确定清空“${bank.name}”中的 ${count} 道题吗？题库名称会保留。`)) return;
      bank.results = Object.fromEntries(QUESTION_BANK_TYPES.map(type => [type, []]));
      bank.typeOrder = []; bank.updatedAt = new Date().toISOString();
      try { saveQuestionBankState(state); refreshBankModal(); showStatus(els, `已清空“${bank.name}”`, 'ok'); }
      catch (error) { showStatus(els, `清空失败：${error.message}`, 'err'); }
    });
    bankModal.querySelector('#xxt-bank-import').addEventListener('click', () => bankModal.querySelector('#xxt-bank-file').click());
    bankModal.querySelector('#xxt-bank-file').addEventListener('change', event => {
      const file = event.target.files && event.target.files[0]; event.target.value = ''; if (!file) return;
      if (file.size > QUESTION_BANK_MAX_BYTES) { showStatus(els, '导入文件超过 8MB，已拒绝', 'err'); return; }
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result || ''));
          if (!isSupportedQuestionBankImport(parsed)) throw new Error('不支持的题库结构；请选择本脚本备份、参考脚本题库或 OCS JSON');
          const imported = normalizeQuestionBankState(parsed);
          const importCount = imported.banks.reduce((sum, bank) => sum + bankQuestionCount(bank), 0);
          if (!importCount) throw new Error('文件中没有识别到有效题目，未导入空题库');
          const state = loadQuestionBankState();
          imported.banks.forEach(bank => {
            bank.name = uniqueImportedBankName(state, bank.name);
            bank.id = `bank-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            bank.updatedAt = new Date().toISOString(); state.banks.push(bank);
          });
          state.activeBankId = imported.banks[0] ? imported.banks[0].id : state.activeBankId;
          saveQuestionBankState(state); refreshBankModal();
          showStatus(els, `导入成功：${imported.banks.length} 个题库，共 ${importCount} 道题`, 'ok');
        } catch (error) { showStatus(els, `导入失败：${error.message || 'JSON 格式无效'}`, 'err'); }
      };
      reader.onerror = () => showStatus(els, '导入失败：浏览器无法读取该文件', 'err');
      reader.readAsText(file, 'utf-8');
    });
    bankSearchInput.addEventListener('input', () => { bankSearchText = bankSearchInput.value; bankCurrentPage = 1; renderBankList(); });
    bankModal.querySelector('#xxt-bank-search-btn').addEventListener('click', () => { bankSearchText = bankSearchInput.value; bankCurrentPage = 1; renderBankList(); });
    bankModal.querySelector('#xxt-bank-compare-btn').addEventListener('click', compareCurrentPageWithBank);
    bankList.addEventListener('click', event => {
      const pageAction = event.target.closest('[data-bank-page]');
      if (pageAction && !pageAction.disabled) {
        bankCurrentPage += pageAction.dataset.bankPage === 'next' ? 1 : -1;
        renderBankList();
        return;
      }
      const card = event.target.closest('.xxt-bank-card'); const action = event.target.closest('[data-bank-action]');
      if (!card || !action) return;
      const bank = getActiveQuestionBank(); const type = card.dataset.bankType; const index = Number(card.dataset.bankIndex);
      const question = bank && bank.results[type] && bank.results[type][index]; if (!question) return;
      if (action.dataset.bankAction === 'edit') { openBankEditor(bank, type, index); return; }
      if (action.dataset.bankAction === 'load') { loadBankIntoPanel(createExtractedDataFromResults({ [type]: [question] }, [type], `${bank.name}-${type}`)); return; }
      if (action.dataset.bankAction === 'delete') {
        if (!confirm('确定删除这道题吗？')) return;
        bank.results[type].splice(index, 1); bank.typeOrder = QUESTION_BANK_TYPES.filter(item => bank.results[item].length); bank.updatedAt = new Date().toISOString();
        const state = loadQuestionBankState(); state.banks = state.banks.map(item => item.id === bank.id ? bank : item);
        try { saveQuestionBankState(state); refreshBankModal(); } catch (error) { showStatus(els, `删除失败：${error.message}`, 'err'); }
      }
    });

    saveBankModeButtons.forEach(button => button.addEventListener('click', () => setSaveBankMode(button.dataset.saveBankMode, true)));
    saveBankSelect.addEventListener('change', updateSaveBankHint);
    saveBankNameInput.addEventListener('input', updateSaveBankHint);
    saveBankForm.addEventListener('submit', event => {
      event.preventDefault();
      const newBankName = saveBankMode === 'new' ? saveBankNameInput.value.trim() : '';
      if (saveBankMode === 'new' && !newBankName) {
        updateSaveBankHint();
        saveBankNameInput.focus();
        return;
      }
      const saved = saveCurrentToBank(saveBankMode === 'existing' ? saveBankSelect.value : '', newBankName);
      if (saved) saveBankModal.classList.remove('open');
    });
    saveBankModal.querySelector('#xxt-save-bank-close').addEventListener('click', () => saveBankModal.classList.remove('open'));
    saveBankModal.querySelector('#xxt-save-bank-cancel').addEventListener('click', () => saveBankModal.classList.remove('open'));
    saveBankModal.addEventListener('click', event => { if (event.target === saveBankModal) saveBankModal.classList.remove('open'); });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && saveBankModal.classList.contains('open')) saveBankModal.classList.remove('open');
    }, { signal: uiEventController.signal });

    els.bankBtn.addEventListener('click', () => { refreshBankModal(true); bankModal.classList.add('open'); });
    els.btnSaveToBank.addEventListener('click', openSaveCurrentToBankDialog);
    bankModal.querySelector('#xxt-bank-close').addEventListener('click', () => bankModal.classList.remove('open'));
    bankModal.addEventListener('click', event => { if (event.target === bankModal) bankModal.classList.remove('open'); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && bankModal.classList.contains('open')) bankModal.classList.remove('open'); }, { signal: uiEventController.signal });

    // ==================== 在线查看/编辑题目 ====================
    const editorModal = document.createElement('div');
    editorModal.id = 'xxt-editor-modal';
    editorModal.innerHTML = `
      <div class="xxt-editor-box">
        <div class="xxt-modal-header">
          <h3>在线查看 / 编辑题目</h3>
          <button class="xxt-modal-close" id="xxt-editor-close">&times;</button>
        </div>
        <p class="xxt-editor-note">可修改题干、选项和正确答案；勾选题目后，下载、复制和存入题库只使用所选题目。图片以〔图片1〕形式保留。</p>
        <div class="xxt-editor-list" id="xxt-editor-list"></div>
        <div class="xxt-editor-actions">
          <button class="xxt-editor-cancel" id="xxt-editor-cancel">取消</button>
          <button class="xxt-editor-save" id="xxt-editor-save">保存修改</button>
        </div>
      </div>
    `;
    document.body.appendChild(editorModal);
    enableXxtDragging(editorModal.querySelector('.xxt-editor-box'), editorModal.querySelector('.xxt-modal-header'), 'editor');
    const editorList = editorModal.querySelector('#xxt-editor-list');
    const editorClose = editorModal.querySelector('#xxt-editor-close');
    const editorCancel = editorModal.querySelector('#xxt-editor-cancel');
    const editorSave = editorModal.querySelector('#xxt-editor-save');
    let editorDraft = null;
    let editorSession = { kind: 'extracted' };
    const editorTypeLabels = { '单选': '单选题', '多选': '多选题', '填空': '填空题', '判断': '判断题', '简答': '简答题' };
    editorList.addEventListener('change', event => {
      if (event.target && event.target.classList.contains('xxt-editor-select')) updateEditorSelectionUI();
    });

    function makeEditorField(labelText, tagName, className, value) {
      const wrap = document.createElement('div');
      const label = document.createElement('label');
      label.className = 'xxt-editor-label';
      label.textContent = labelText;
      const field = document.createElement(tagName);
      field.className = className;
      field.value = value || '';
      wrap.append(label, field);
      return { wrap, field };
    }

    function appendEditorOption(container, letter, value, sourceIndex = -1) {
      const row = document.createElement('div');
      row.className = 'xxt-editor-option';
      row.dataset.letter = letter;
      row.dataset.sourceIndex = String(sourceIndex);
      const letterEl = document.createElement('span');
      letterEl.className = 'xxt-editor-letter';
      letterEl.textContent = `${letter}.`;
      const input = document.createElement('textarea');
      input.className = 'xxt-editor-option-input';
      input.value = value || '';
      input.rows = 1;
      const remove = document.createElement('button');
      remove.className = 'xxt-editor-remove';
      remove.type = 'button';
      remove.title = '删除选项';
      remove.textContent = '×';
      remove.addEventListener('click', () => {
        row.remove();
        Array.from(container.querySelectorAll('.xxt-editor-option')).forEach((item, i) => {
          const next = String.fromCharCode(65 + i);
          item.dataset.letter = next;
          item.querySelector('.xxt-editor-letter').textContent = `${next}.`;
        });
      });
      row.append(letterEl, input, remove);
      container.appendChild(row);
    }

    function isEditorQuestionSelected(type, question) {
      return selectedExportQuestionKeys === null || selectedExportQuestionKeys.has(exportQuestionKey(type, question));
    }

    function updateEditorSelectionUI() {
      const toolbar = editorModal.querySelector('#xxt-editor-selection-toolbar');
      if (!toolbar) return;
      const checkboxes = Array.from(editorList.querySelectorAll('.xxt-editor-select'));
      const selected = checkboxes.filter(input => input.checked).length;
      const countEl = toolbar.querySelector('.xxt-editor-selection-count');
      if (countEl) countEl.textContent = `已选 ${selected} / ${checkboxes.length} 题`;
      editorList.querySelectorAll('.xxt-editor-card').forEach(card => {
        const checkbox = card.querySelector('.xxt-editor-select');
        card.classList.toggle('xxt-editor-unselected', !!checkbox && !checkbox.checked);
      });
    }

    function renderEditor(data, session = { kind: 'extracted' }) {
      editorList.innerHTML = '';
      const previousToolbar = editorModal.querySelector('#xxt-editor-selection-toolbar');
      if (previousToolbar) previousToolbar.remove();
      editorSession = { ...session };
      if (!data || (!hasQuestions(data) && session.kind !== 'bankNewQuestion')) {
        editorList.textContent = '暂无题目，请先提取题目。';
        return;
      }
      // 编辑使用副本，点击取消不会改变当前导出结果。
      const rawDraft = JSON.parse(JSON.stringify((data && data.results) || {}));
      editorDraft = Object.fromEntries(QUESTION_BANK_TYPES.map(type => [
        type, Array.isArray(rawDraft[type]) ? rawDraft[type].filter(Boolean) : []
      ]));
      const typeOrder = (data.typeOrder || QUESTION_BANK_TYPES).filter(type => editorDraft[type] && editorDraft[type].length);
      if (session.kind === 'extracted') {
        const toolbar = document.createElement('div');
        toolbar.id = 'xxt-editor-selection-toolbar';
        toolbar.className = 'xxt-editor-selection-toolbar';
        toolbar.innerHTML = '<button type="button" data-editor-select-action="all">全选</button><button type="button" data-editor-select-action="none">全不选</button><button type="button" data-editor-select-action="wrong">仅选错题</button><span class="xxt-editor-selection-count"></span>';
        toolbar.addEventListener('click', event => {
          const action = event.target && event.target.dataset && event.target.dataset.editorSelectAction;
          if (!action) return;
          const checkboxes = Array.from(editorList.querySelectorAll('.xxt-editor-select'));
          checkboxes.forEach(input => {
            const card = input.closest('.xxt-editor-card');
            if (action === 'all') input.checked = true;
            else if (action === 'none') input.checked = false;
            else input.checked = card && card.dataset.isWrong === 'true';
          });
          updateEditorSelectionUI();
        });
        // 直接相对题目列表插入，避免页面重绘后 parentElement 与引用节点不一致。
        editorList.before(toolbar);
      }
      typeOrder.forEach(qtype => {
        const questions = editorDraft[qtype] || [];
        if (!questions.length) return;
        const typeTitle = document.createElement('div');
        typeTitle.className = 'xxt-editor-type';
        typeTitle.textContent = `${editorTypeLabels[qtype] || qtype}（${questions.length}题）`;
        editorList.appendChild(typeTitle);
        questions.forEach((q, qIndex) => {
          const card = document.createElement('div');
          card.className = 'xxt-editor-card';
          card.dataset.qtype = qtype;
          card.dataset.qindex = qIndex;
          card.dataset.isWrong = q.isWrong ? 'true' : 'false';
          const titleRow = document.createElement('div');
          titleRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;';
          const title = document.createElement('div');
          title.className = 'xxt-editor-label';
          title.textContent = `第 ${qIndex + 1} 题`;
          titleRow.appendChild(title);
          if (session.kind === 'extracted') {
            const select = document.createElement('input');
            select.type = 'checkbox';
            select.className = 'xxt-editor-select';
            select.title = '勾选后才会用于导出、复制和存入题库';
            select.checked = isEditorQuestionSelected(qtype, q);
            titleRow.insertBefore(select, title);
          }
          const removeQuestion = document.createElement('button');
          removeQuestion.type = 'button';
          removeQuestion.className = 'xxt-editor-remove';
          removeQuestion.title = '删除整道题';
          removeQuestion.textContent = '删除本题';
          removeQuestion.addEventListener('click', () => card.remove());
          titleRow.appendChild(removeQuestion);
          card.appendChild(titleRow);

          const stemField = makeEditorField('题干', 'textarea', 'xxt-editor-stem', richContentToEditableText(questionContent(q)));
          stemField.field.rows = 2;
          card.appendChild(stemField.wrap);
          if (questionContent(q).some(part => part.type === 'image')) {
            const hint = document.createElement('div');
            hint.className = 'xxt-editor-note';
            hint.textContent = '题干含图片；请保留〔图片1〕等占位符，否则对应图片不会出现在导出文件中。';
            card.appendChild(hint);
          }

          const optionContainer = document.createElement('div');
          optionContainer.className = 'xxt-editor-options';
          (q.options || []).forEach((opt, i) => appendEditorOption(optionContainer, opt.letter || String.fromCharCode(65 + i), richContentToEditableText(optionContent(opt)), i));
          card.appendChild(optionContainer);
          if (qtype === '单选' || qtype === '多选') {
            const add = document.createElement('button');
            add.type = 'button';
            add.className = 'xxt-editor-add';
            add.textContent = '+ 添加选项';
            add.addEventListener('click', () => {
              const count = optionContainer.querySelectorAll('.xxt-editor-option').length;
              if (count < 8) appendEditorOption(optionContainer, String.fromCharCode(65 + count), '');
            });
            card.appendChild(add);
          }

          const answerField = makeEditorField('正确答案（可留空）', 'textarea', 'xxt-editor-answer', richContentToEditableText(answerContent(q)));
          answerField.field.rows = 1;
          card.appendChild(answerField.wrap);
          editorList.appendChild(card);
        });
      });
      updateEditorSelectionUI();
    }

    function saveEditorChanges() {
      if (!editorDraft) return;
      // 从仍存在的卡片重建结果，删除整题后不会把隐藏的旧题再次保存。
      const nextResults = Object.fromEntries(QUESTION_BANK_TYPES.map(type => [type, []]));
      const nextSelectedKeys = new Set();
      let selectedCardCount = 0;
      editorList.querySelectorAll('.xxt-editor-card').forEach(card => {
        const qtype = card.dataset.qtype;
        const qIndex = parseInt(card.dataset.qindex, 10);
        const source = editorDraft[qtype] && editorDraft[qtype][qIndex];
        if (!source) return;
        const q = JSON.parse(JSON.stringify(source));
        const oldStem = questionContent(q);
        const oldAnswer = answerContent(q);
        const stemInput = card.querySelector('.xxt-editor-stem');
        const answerInput = card.querySelector('.xxt-editor-answer');
        q.stemContent = editableTextToRichContent(stemInput ? stemInput.value : '', oldStem);
        q.stem = formatRichForText(q.stemContent);
        q.options = Array.from(card.querySelectorAll('.xxt-editor-option')).map((row, i) => {
          const sourceIndex = parseInt(row.dataset.sourceIndex, 10);
          const old = (q.options || [])[Number.isInteger(sourceIndex) && sourceIndex >= 0 ? sourceIndex : i] || {};
          const content = editableTextToRichContent(row.querySelector('textarea')?.value || '', optionContent(old));
          return { ...old, letter: row.dataset.letter || String.fromCharCode(65 + i), text: richTextOnly(content), content };
        });
        q.correctAnswerContent = editableTextToRichContent(answerInput ? answerInput.value : '', oldAnswer);
        q.correctAnswer = richTextOnly(q.correctAnswerContent);
        if (QUESTION_BANK_TYPES.includes(qtype)) {
          nextResults[qtype].push(q);
          const select = card.querySelector('.xxt-editor-select');
          if (editorSession.kind === 'extracted' && select && select.checked) {
            selectedCardCount++;
            nextSelectedKeys.add(exportQuestionKey(qtype, q));
          }
        }
      });
      const nextTypeOrder = QUESTION_BANK_TYPES.filter(type => nextResults[type].length);
      const savedCount = nextTypeOrder.reduce((sum, type) => sum + nextResults[type].length, 0);
      if (editorSession.kind === 'bank' || editorSession.kind === 'bankQuestion' || editorSession.kind === 'bankNewQuestion') {
        const state = loadQuestionBankState();
        const target = state.banks.find(bank => bank.id === editorSession.bankId);
        if (!target) { showStatus(els, '目标题库不存在，未保存修改', 'err'); return; }
        if (editorSession.kind === 'bankQuestion') {
          const type = editorSession.type;
          const replacement = (nextResults[type] || [])[0];
          if (replacement) target.results[type][editorSession.index] = normalizeBankQuestion(replacement);
          else target.results[type].splice(editorSession.index, 1);
          target.typeOrder = QUESTION_BANK_TYPES.filter(item => (target.results[item] || []).length);
        } else if (editorSession.kind === 'bankNewQuestion') {
          const type = editorSession.type;
          const replacement = normalizeBankQuestion((nextResults[type] || [])[0]);
          if (!replacement) { showStatus(els, '请填写题干后再保存', 'warn'); return; }
          const identity = bankQuestionIdentity(type, replacement);
          if ((target.results[type] || []).some(question => bankQuestionIdentity(type, question) === identity)) {
            showStatus(els, '题库中已存在相同题目，未重复添加', 'warn'); return;
          }
          target.results[type].push(replacement);
          if (!target.typeOrder.includes(type)) target.typeOrder.push(type);
        } else {
          target.results = normalizeQuestionBank({ ...target, results: nextResults, typeOrder: nextTypeOrder }).results;
          target.typeOrder = QUESTION_BANK_TYPES.filter(type => target.results[type].length);
        }
        target.updatedAt = new Date().toISOString();
        try {
          saveQuestionBankState(state);
          refreshBankModal();
          showStatus(els, editorSession.kind === 'bankQuestion'
            ? `已保存题库“${target.name}”的单题修改`
            : editorSession.kind === 'bankNewQuestion'
              ? `已向题库“${target.name}”添加 1 道题`
              : `已保存题库“${target.name}”修改，共 ${savedCount} 道题`, 'ok');
        } catch (error) { showStatus(els, `题库存储失败：${error.message}`, 'err'); return; }
        editorModal.classList.remove('open'); editorDraft = null; editorSession = { kind: 'extracted' }; return;
      }
      editorDraft = nextResults;
      extractedData.results = editorDraft;
      extractedData.typeOrder = nextTypeOrder;
      if (editorSession.kind === 'extracted') {
        selectedExportQuestionKeys = selectedCardCount === savedCount ? null : nextSelectedKeys;
      }
      refreshExtractedOutputCache(extractedData);
      renderStats(els);
      updateExportSelectionSummary();
      updateFilename(els);
      if (els.chkAnswers) {
        els.chkAnswers.disabled = !extractedData.hasCorrectAnswer;
        if (!extractedData.hasCorrectAnswer) els.chkAnswers.checked = false;
      }
      const ansToggle = document.getElementById('xxt-ans-toggle');
      if (ansToggle) ansToggle.classList.toggle('xxt-disabled', !extractedData.hasCorrectAnswer);
      const isBankImport = els.chkBankImport && els.chkBankImport.checked;
      if (extractedData.hasMyAnswer && extractedData.wrongCount > 0 && !isBankImport) {
        els.wrongToggle.classList.remove('xxt-hidden');
        els.wrongHint.textContent = `检测到 ${extractedData.wrongCount} 道错题，可勾选附加到输出末尾`;
        els.wrongHint.classList.remove('xxt-hidden');
      } else {
        els.wrongToggle.classList.add('xxt-hidden');
        els.wrongHint.classList.add('xxt-hidden');
        els.chkWrong.checked = false;
      }
      showStatus(els, `已保存题目修改，共 ${extractedData.total} 道题`, 'ok');
      editorModal.classList.remove('open');
      editorDraft = null;
    }

    const openExtractedEditor = () => {
      // 先打开弹窗再渲染，避免某一道异常题目导致点击后完全没有反馈。
      editorModal.classList.add('open');
      try {
        renderEditor(extractedData);
      } catch (error) {
        editorList.textContent = '题目编辑器加载失败，请重新提取后重试。';
        console.error('[学习通题目导出] 编辑器加载失败', error);
        showStatus(els, `编辑器加载失败：${error && error.message ? error.message : error}`, 'err');
      }
    };
    els.btnEdit.addEventListener('click', event => {
      event.__xxtEditorHandled = true;
      openExtractedEditor();
    });
    // 兼容学习通页面对按钮事件的代理/重绘：即使结果区被替换，
    // 通过面板委托仍能打开编辑器。
    panel.addEventListener('click', event => {
      const target = event.target && event.target.closest && event.target.closest('#xxt-btnEdit');
      if (!target || event.__xxtEditorHandled || event.target === target) return;
      event.__xxtEditorHandled = true;
      openExtractedEditor();
    });
    editorClose.addEventListener('click', () => { editorModal.classList.remove('open'); editorDraft = null; });
    editorCancel.addEventListener('click', () => { editorModal.classList.remove('open'); editorDraft = null; });
    editorSave.addEventListener('click', saveEditorChanges);
    editorModal.addEventListener('click', e => {
      if (e.target === editorModal) { editorModal.classList.remove('open'); editorDraft = null; }
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && editorModal.classList.contains('open')) {
        editorModal.classList.remove('open');
        editorDraft = null;
      }
    }, { signal: uiEventController.signal });

    function syncExtractionOptionState(data) {
      if (!data) return;
      const hasCorrectAnswer = data.hasCorrectAnswer === true ||
        Object.values(data.results || {}).some(list =>
          (list || []).some(question => question && (question.correctAnswer || hasRichContent(question.correctAnswerContent))));
      const hasMyAnswer = !!data.hasMyAnswer;
      const hasWrong = Number(data.wrongCount || 0) > 0;
      const isBankImport = !!(els.chkBankImport && els.chkBankImport.checked);
      const format = getFormat(els);
      const isPaged = format === 'word' || format === 'pdf';
      const ansToggle = document.getElementById('xxt-ans-toggle');
      const shuffleToggle = document.getElementById('xxt-shuffle-toggle');
      if (els.chkAnswers) {
        els.chkAnswers.disabled = isBankImport || !hasCorrectAnswer;
        if (!hasCorrectAnswer || isBankImport) els.chkAnswers.checked = false;
      }
      if (ansToggle) {
        ansToggle.classList.toggle('xxt-disabled', isBankImport || !hasCorrectAnswer);
        const input = ansToggle.querySelector('input');
        if (input) input.disabled = isBankImport || !hasCorrectAnswer;
      }
      if (els.chkShuffle) els.chkShuffle.disabled = isBankImport;
      if (shuffleToggle) {
        shuffleToggle.classList.toggle('xxt-disabled', isBankImport);
        const input = shuffleToggle.querySelector('input');
        if (input) input.disabled = isBankImport;
      }
      if (els.wrongToggle) {
        const showWrong = hasMyAnswer && hasWrong && !isBankImport && !isPaged;
        els.wrongToggle.classList.toggle('xxt-hidden', !showWrong);
        els.wrongToggle.classList.toggle('xxt-disabled', isBankImport);
        const input = els.wrongToggle.querySelector('input');
        if (input) input.disabled = isBankImport;
      }
      if (els.wrongHint) {
        const showHint = hasMyAnswer && hasWrong && !isBankImport && !isPaged;
        els.wrongHint.classList.toggle('xxt-hidden', !showHint);
        els.wrongHint.style.display = isPaged ? 'none' : '';
        if (showHint) els.wrongHint.textContent = `检测到 ${data.wrongCount} 道错题，可勾选附加到输出末尾`;
      }
    }

    // 格式/选项切换时更新文件名
    panel.addEventListener('change', (e) => {
      if (!extractedData) return;
      if (e.target.name === 'xxt-fmt') {
        updateFilename(els);
        const isWord = getFormat(els) === 'word';
        // 题库导入格式仅适用于 Word
        if (els.bankImportToggle) els.bankImportToggle.style.display = isWord ? '' : 'none';
        if (!isWord && els.chkBankImport) els.chkBankImport.checked = false;
        syncExtractionOptionState(extractedData);
      }
      // 题库导入格式切换：勾选时禁用打乱和答案选项（不隐藏，维持高度稳定）
      if (e.target === els.chkBankImport) {
        updateFilename(els);
        const checked = els.chkBankImport.checked;
        const hasCorrectAnswer = extractedData.hasCorrectAnswer !== false;
        const ansToggle = document.getElementById('xxt-ans-toggle');
        const shuffleToggle = document.getElementById('xxt-shuffle-toggle');
        const wrongToggle = document.getElementById('xxt-wrong-toggle');
        if (ansToggle) {
          ansToggle.classList.toggle('xxt-disabled', checked || !hasCorrectAnswer);
          if (ansToggle.querySelector('input')) ansToggle.querySelector('input').disabled = checked || !hasCorrectAnswer;
        }
        if (shuffleToggle) {
          shuffleToggle.classList.toggle('xxt-disabled', checked);
          if (shuffleToggle.querySelector('input')) shuffleToggle.querySelector('input').disabled = checked;
        }
        if (wrongToggle) {
          wrongToggle.classList.toggle('xxt-disabled', checked);
          if (wrongToggle.querySelector('input')) wrongToggle.querySelector('input').disabled = checked;
        }
        if (checked) {
          if (els.chkAnswers) els.chkAnswers.checked = false;
          if (els.chkShuffle) els.chkShuffle.checked = false;
          if (els.chkWrong) els.chkWrong.checked = false;
        }
        syncExtractionOptionState(extractedData);
      }
      // 勾选/取消附加答案时更新文件名
      if (e.target === els.chkAnswers) {
        updateFilename(els);
      }
      // 保存导出配置
      if (extractedData) saveExportConfig(els);
    });

    async function waitForFreshIframeQuestions(generation, timeout = 12000) {
      const startedAt = Date.now();
      const previousSignature = window.__xxt_ignore_iframe_signature || '';
      const previousMessageAt = window.__xxt_last_iframe_message_at || 0;
      let nextRequestAt = 0;
      while (Date.now() - startedAt < timeout) {
        if (generation !== extractionGeneration) return emptyExtractResult();
        const now = Date.now();
        const iframeData = window.__xxt_iframe_data;
        const signature = iframeDataSignature(iframeData);
        const isFreshMessage = (window.__xxt_last_iframe_message_at || 0) > previousMessageAt;
        if (iframeData && hasQuestions(iframeData) && signature &&
            (isFreshMessage || signature !== previousSignature)) {
          return extract({ preferIframe: true, iframeOnly: true });
        }
        // 新页面的 iframe 可能尚未完成第一次 postMessage，分阶段请求，
        // 让切换较慢的随堂练习也能在本次手动提取中完成识别。
        if (now >= nextRequestAt) {
          requestIframeExtraction();
          nextRequestAt = now + 900;
        }
        await new Promise(resolve => setTimeout(resolve, 180));
      }
      return emptyExtractResult();
    }

    els.btnExtract.addEventListener('click', async () => {
      const generation = extractionGeneration;
      els.btnExtract.disabled = true;
      els.btnExtract.textContent = '提取中...';
      els.status.className = 'xxt-hidden';
      els.result.classList.add('xxt-hidden');

      let extracted;
      try {
        // 当前题目页可能使用自定义 WebFont；先尝试建立码点映射，失败时
        // 继续原有提取流程，不影响作业、考试和随堂练习。
        await prepareFontCipherDecoder(document);
        // 手动提取时优先读取当前题目页；若题目位于跨域/嵌套 iframe，
        // 再请求 iframe 回传并等待本次页面的新结果。
        const navigationPending = Date.now() - (window.__xxt_navigation_started_at || 0) < 6000;
        const topResult = navigationPending ? emptyExtractResult() : extractFromRoot(document);
        if (hasQuestions(topResult)) {
          extracted = topResult;
        } else {
          window.__xxt_iframe_data = null;
          window.__xxt_iframe_context = null;
          window.__xxt_navigation_started_at = Date.now();
          requestIframeExtraction();
          showStatus(els, '页面正在加载，正在识别题目…', 'loading');
          extracted = await waitForFreshIframeQuestions(generation, 12000);
        }
        if (generation !== extractionGeneration) return;
        const { results, typeOrder, wrongCount, hasMyAnswer, hasCorrectAnswer } = extracted;
        const total = Object.values(results).reduce((s, a) => s + a.length, 0);

        if (total === 0) {
          showStatus(els, '题目仍在加载，暂未完成识别，请稍后点击“重新提取”', 'loading');
          els.btnExtract.disabled = false;
          els.btnExtract.textContent = '提取本页题目';
          return;
        }

        const titleEl = document.querySelector('.mark_title');
        const title = extracted.title || (titleEl ? decodeFontCipherText(titleEl.textContent.trim(), titleEl) : '');

        extractedData = {
          total, title, typeOrder, results, wrongCount, hasMyAnswer, hasCorrectAnswer,
          breakdown: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, v.length])),
          text: formatOutput(results, typeOrder),
          textWithAnswers: formatOutputWithAnswers(results, typeOrder),
          textWrong: formatWrongQuestionsTXT(results, typeOrder),
          textMD: formatOutputMD(results, typeOrder),
          textWithAnswersMD: formatOutputWithAnswersMD(results, typeOrder),
          textWrongMD: formatWrongQuestionsMD(results, typeOrder),
        };
        // 不信任页面分支返回的布尔标记：统一从已提取到的每道题答案重新计算。
        // 这样即使阅卷页把“正确答案”和值拆进相邻节点，开关也不会被误锁住。
        recalculateExtractedMeta(extractedData);
        resetExportQuestionSelection();

        renderStats(els);
        updateFilename(els);
        els.result.classList.remove('xxt-hidden');
        syncExtractionOptionState(extractedData);
        if (els.chkWrong) els.chkWrong.checked = false;

        showStatus(els, `成功提取 ${extractedData.total} 道题目` + (extractedData.wrongCount > 0 ? `，含 ${extractedData.wrongCount} 道错题` : ''), 'ok');
        els.btnExtract.disabled = false;
        els.btnExtract.textContent = '重新提取';
      } catch (error) {
        if (generation === extractionGeneration) {
          showStatus(els, `提取失败：${error && error.message ? error.message : error}`, 'err');
        }
      } finally {
        // 无论解析器/iframe 请求是否异常，都不能让主按钮永久卡在“提取中”。
        if (generation === extractionGeneration && els.btnExtract.disabled) {
          els.btnExtract.disabled = false;
          els.btnExtract.textContent = '提取本页题目';
        }
      }
    });

    els.btnDownload.addEventListener('click', async () => {
      if (!extractedData) return;
      const exportData = getSelectedExtractedData();
      if (!exportData || !hasQuestions(exportData)) {
        showStatus(els, '当前没有勾选题目，请先选择至少 1 道题', 'warn');
        return;
      }
      const fmt = getFormat(els);
      const baseFilename = (els.filename.value || '学习通题目').replace(/\.(txt|md|docx|pdf)$/, '');

      if (fmt === 'pdf') {
        els.btnDownload.disabled = true;
        els.btnDownload.textContent = '生成中...';
        try {
          const isBankImport = false;
          const doShuffle = els.chkShuffle && els.chkShuffle.checked;
          const withWrong = els.chkWrong && els.chkWrong.checked;
          const activeResults = doShuffle
            ? shuffleQuestions(exportData.results, exportData.typeOrder)
            : exportData.results;
          await generatePdf(activeResults, exportData.typeOrder, exportData.title,
            !!(els.chkAnswers && els.chkAnswers.checked), withWrong, baseFilename + '.pdf');
          showStatus(els, 'PDF 已下载', 'ok');
          addToHistory(exportData, 'pdf', !!(els.chkAnswers && els.chkAnswers.checked), withWrong, doShuffle, isBankImport, '');
        } catch (err) {
          showStatus(els, 'PDF 导出失败: ' + err.message, 'err');
        }
        els.btnDownload.disabled = false;
        els.btnDownload.textContent = '\u21E9 下载';
        return;
      }

      if (fmt === 'word') {
        // 常规 Word 导出也统一使用原生 .docx。
        els.btnDownload.disabled = true;
        els.btnDownload.textContent = '生成 Word...';
        try {
          const isBankImport = els.chkBankImport && els.chkBankImport.checked;
          const doShuffle = !isBankImport && els.chkShuffle && els.chkShuffle.checked;
          const withWrong = !isBankImport && els.chkWrong && els.chkWrong.checked;
          const activeResults = doShuffle
            ? shuffleQuestions(exportData.results, exportData.typeOrder)
            : exportData.results;
          window.__xxt_failed_image_count = 0;
          // 给“生成 Word”状态一次绘制机会，再开始原生 docx 打包。
          await new Promise(resolve => setTimeout(resolve, 0));
          const blob = await generateWordBlob(
            activeResults, exportData.typeOrder, exportData.title,
            isBankImport || !!els.chkAnswers.checked, withWrong, isBankImport
          );
          const filename = baseFilename + '.docx';
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = filename; a.click();
          URL.revokeObjectURL(url);
          const failedImg = window.__xxt_failed_image_count || 0;
          const warnMsg = failedImg > 0 ? `（${failedImg} 张图片加载失败）` : '';
          showStatus(els, (isBankImport ? '题库导入格式已下载（.docx）' : 'Word 试卷（.docx）' + (els.chkAnswers.checked ? '（含答案）' : '') + (withWrong ? '（含错题）' : '') + '已下载') + warnMsg, failedImg > 0 ? 'warn' : 'ok');
          addToHistory(exportData, 'word', isBankImport || els.chkAnswers.checked, withWrong, doShuffle, isBankImport, '');
        } catch (err) {
          showStatus(els, 'Word 导出失败: ' + err.message, 'err');
        }
        els.btnDownload.disabled = false;
        els.btnDownload.textContent = '\u21E9 下载';
        return;
      }

      const ext = fmt === 'md' ? '.md' : '.txt';
      const mime = fmt === 'md' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8';

      // 合并下载
      const text = getOutputText(els, exportData);
      const filename = baseFilename + ext;
      const blob = new Blob([text], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      addToHistory(exportData, fmt, els.chkAnswers.checked, els.chkWrong && els.chkWrong.checked, els.chkShuffle && els.chkShuffle.checked, false, text);
    });

    els.btnPreview.addEventListener('click', () => openExportPreview(els));

    els.btnCopy.addEventListener('click', async () => {
      if (!extractedData) return;
      const exportData = getSelectedExtractedData();
      if (!exportData || !hasQuestions(exportData)) {
        showStatus(els, '当前没有勾选题目，请先选择至少 1 道题', 'warn');
        return;
      }
      const fmt = getFormat(els);
      if (fmt === 'word' || fmt === 'pdf') {
        showStatus(els, `${fmt === 'pdf' ? 'PDF' : 'Word'} 格式不支持复制，请使用下载`, 'warn');
        return;
      }
      const text = getOutputText(els, exportData);
      try {
        await navigator.clipboard.writeText(text);
      } catch (err) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      showStatus(els, '已复制到剪贴板', 'ok');
    });

    _creatingPanel = false;
  }

  let exportPreviewState = { page: 0, pages: [], els: null, data: null, format: 'word' };

  function previewEscapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = String(value == null ? '' : value);
    return div.innerHTML;
  }

  function previewRichHtml(content) {
    return (content || []).map(part => {
      if (part.type === 'text') return previewEscapeHtml(part.text || '').replace(/\n/g, '<br>');
      if (part.type === 'break') return '<br>';
      if (part.type === 'image' && part.url) {
        const src = String(part.url).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
        const alt = previewEscapeHtml(part.alt || '题目图片');
        return `<img src="${src}" alt="${alt}" loading="lazy">`;
      }
      return '';
    }).join('');
  }

  function getPreviewModal() {
    let modal = document.getElementById('xxt-preview-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'xxt-preview-modal';
    modal.innerHTML = `
      <div class="xxt-preview-box">
        <div class="xxt-modal-header"><h3>导出预览</h3><button type="button" class="xxt-modal-close" id="xxt-preview-close" aria-label="关闭">&times;</button></div>
        <p class="xxt-preview-meta" id="xxt-preview-meta"></p>
        <div class="xxt-preview-content" id="xxt-preview-content"></div>
        <div class="xxt-preview-pager"><button type="button" id="xxt-preview-prev">上一页</button><span id="xxt-preview-page"></span><button type="button" id="xxt-preview-next">下一页</button></div>
        <div class="xxt-preview-actions"><button type="button" class="xxt-preview-cancel" id="xxt-preview-cancel">关闭</button><button type="button" class="xxt-preview-download" id="xxt-preview-download">确认并下载</button></div>
      </div>`;
    document.body.appendChild(modal);
    enableXxtDragging(modal.querySelector('.xxt-preview-box'), modal.querySelector('.xxt-modal-header'), 'preview');
    const close = () => modal.classList.remove('open');
    modal.querySelector('#xxt-preview-close').addEventListener('click', close);
    modal.querySelector('#xxt-preview-cancel').addEventListener('click', close);
    modal.addEventListener('click', event => { if (event.target === modal) close(); });
    modal.querySelector('#xxt-preview-prev').addEventListener('click', () => { if (exportPreviewState.page > 0) { exportPreviewState.page--; renderExportPreview(); } });
    modal.querySelector('#xxt-preview-next').addEventListener('click', () => { if (exportPreviewState.page + 1 < exportPreviewState.pages.length) { exportPreviewState.page++; renderExportPreview(); } });
    modal.querySelector('#xxt-preview-download').addEventListener('click', () => {
      close();
      if (exportPreviewState.els && exportPreviewState.els.btnDownload) exportPreviewState.els.btnDownload.click();
    });
    return modal;
  }

  function renderExportPreview() {
    const modal = getPreviewModal();
    const { page, pages, data, els, format } = exportPreviewState;
    if (!data || !pages.length) return;
    const withAnswers = !!(els.chkAnswers && els.chkAnswers.checked) || !!(els.chkBankImport && els.chkBankImport.checked);
    const withWrong = !!(els.chkWrong && els.chkWrong.checked) && !(els.chkBankImport && els.chkBankImport.checked);
    const doShuffle = !!(els.chkShuffle && els.chkShuffle.checked) && !(els.chkBankImport && els.chkBankImport.checked);
    const selectedCount = data.total || 0;
    const optionText = [withAnswers ? '含答案' : '不含答案', withWrong ? '含错题' : '', doShuffle ? '题目乱序' : ''].filter(Boolean).join(' · ');
    modal.querySelector('#xxt-preview-meta').textContent = `${data.title || '学习通题目'} · ${selectedCount} 道已选题 · ${format.toUpperCase()} · ${optionText}`;
    modal.querySelector('#xxt-preview-page').textContent = `第 ${page + 1} / ${pages.length} 页`;
    modal.querySelector('#xxt-preview-prev').disabled = page <= 0;
    modal.querySelector('#xxt-preview-next').disabled = page >= pages.length - 1;
    const current = pages[page];
    let html = '';
    if (format === 'txt' || format === 'md') {
      const text = getOutputText(els, data);
      const lines = text.split(/\r?\n/);
      const chunkSize = 90;
      const start = page * chunkSize;
      html = `<pre class="xxt-preview-code">${previewEscapeHtml(lines.slice(start, start + chunkSize).join('\n'))}</pre>`;
    } else {
      const labels = { '单选': '单选题', '多选': '多选题', '填空': '填空题', '判断': '判断题', '简答': '简答题' };
      html = `<div class="xxt-preview-document">${page === 0 ? `<h1>${previewEscapeHtml(data.title || '学习通题目')}</h1>` : ''}`;
      let lastType = '';
      current.forEach(item => {
        const q = item.question;
        if (item.type !== lastType) { html += `<h2>${previewEscapeHtml(labels[item.type] || item.type)}</h2>`; lastType = item.type; }
        html += `<div class="xxt-preview-question"><div class="xxt-preview-stem"><b>${item.number}.</b> ${previewRichHtml(questionContent(q))}${q.isWrong ? '<span class="xxt-preview-wrong">错题</span>' : ''}</div>`;
        (q.options || []).forEach(opt => { html += `<div class="xxt-preview-option">${previewEscapeHtml(opt.letter || '')}. ${previewRichHtml(optionContent(opt))}</div>`; });
        if (withAnswers) html += `<div class="xxt-preview-answer"><b>答案：</b>${previewRichHtml(answerContent(q)) || unavailableCorrectAnswerText(q)}</div>`;
        html += '</div>';
      });
      if (withWrong && page === pages.length - 1) {
        const wrong = [];
        (data.typeOrder || []).forEach(type => (data.results[type] || []).forEach(q => { if (q.isWrong) wrong.push(q); }));
        if (wrong.length) {
          html += '<div class="xxt-preview-wrong-block"><h2>错题汇总</h2>';
          wrong.forEach(q => { html += `<div class="xxt-preview-wrong-item">${previewRichHtml(questionContent(q))}<br>我的答案：${previewEscapeHtml(q.myAnswer || '无')}<br>正确答案：${previewRichHtml(answerContent(q)) || unavailableCorrectAnswerText(q)}</div>`; });
          html += '</div>';
        }
      }
      html += '</div>';
    }
    modal.querySelector('#xxt-preview-content').innerHTML = html;
  }

  function openExportPreview(els) {
    if (!extractedData) return;
    const data = getSelectedExtractedData();
    if (!data || !hasQuestions(data)) { showStatus(els, '当前没有勾选题目，请先选择至少 1 道题', 'warn'); return; }
    const format = getFormat(els);
    const activeResults = (els.chkShuffle && els.chkShuffle.checked && !(els.chkBankImport && els.chkBankImport.checked))
      ? shuffleQuestions(data.results, data.typeOrder) : data.results;
    const pages = [];
    if (format === 'txt' || format === 'md') {
      const lineCount = Math.max(1, getOutputText(els, data).split(/\r?\n/).length);
      for (let i = 0; i < lineCount; i += 90) pages.push([]);
    } else {
      let number = 0; let page = [];
      (data.typeOrder || []).forEach(type => (activeResults[type] || []).forEach(question => {
        number++; page.push({ type, question, number });
        if (page.length >= 8) { pages.push(page); page = []; }
      }));
      if (page.length) pages.push(page);
    }
    exportPreviewState = { page: 0, pages: pages.length ? pages : [[]], els, data: { ...data, results: activeResults }, format };
    const modal = getPreviewModal();
    modal.classList.add('open');
    renderExportPreview();
  }

  function getFormat(els) {
    const checked = document.querySelector('input[name="xxt-fmt"]:checked');
    return checked ? checked.value : 'txt';
  }

  function showStatus(els, msg, type) {
    els.status.textContent = msg;
    els.status.className = `xxt-status xxt-status-${type}`;
    els.status.classList.remove('xxt-hidden');
  }

  function getOutputText(els, data = getSelectedExtractedData()) {
    if (!data || !hasQuestions(data)) return '';
    const fmt = getFormat(els);
    const withAnswers = els.chkAnswers.checked;
    const withWrong = els.chkWrong && els.chkWrong.checked;
    const doShuffle = els.chkShuffle && els.chkShuffle.checked;

    // 打乱时所有正文、答案和错题汇总均使用同一份结果，避免序号/顺序不一致。
    let base = '';
    let activeResults = data.results;
    if (doShuffle) {
      activeResults = shuffleQuestions(data.results, data.typeOrder);
      if (fmt === 'md') {
        base = withAnswers ? formatOutputWithAnswersMD(activeResults, data.typeOrder) : formatOutputMD(activeResults, data.typeOrder);
      } else {
        base = withAnswers ? formatOutputWithAnswers(activeResults, data.typeOrder) : formatOutput(activeResults, data.typeOrder);
      }
    } else {
      if (fmt === 'md') {
        base = withAnswers ? data.textWithAnswersMD : data.textMD;
      } else {
        base = withAnswers ? data.textWithAnswers : data.text;
      }
    }

    if (withWrong) {
      const wrong = doShuffle
        ? (fmt === 'md' ? formatWrongQuestionsMD(activeResults, data.typeOrder) : formatWrongQuestionsTXT(activeResults, data.typeOrder))
        : (fmt === 'md' ? data.textWrongMD : data.textWrong);
      return base + wrong;
    }
    return base;
  }

  function updateFilename(els) {
    if (!extractedData) return;
    const title = extractedData.title || '学习通题目';
    const cleanTitle = title.replace(/[\\/:*?"<>|]/g, '_').substring(0, 60);
    const fmt = getFormat(els);
    const ext = fmt === 'md' ? '.md' : fmt === 'word' ? '.docx' : fmt === 'pdf' ? '.pdf' : '.txt';
    // 题库导入格式用"（题库导入）"后缀，附加答案用"（含答案）"
    const isBankImport = els.chkBankImport && els.chkBankImport.checked;
    const suffix = isBankImport ? '（题库导入）' : (els.chkAnswers.checked ? '（含答案）' : '');
    els.filename.value = cleanTitle + suffix + ext;
    els.filename.classList.remove('xxt-hidden');
  }

  function renderStats(els) {
    const typeLabels = { '单选': '单选题', '多选': '多选题', '填空': '填空题', '判断': '判断题', '简答': '简答题' };
    const order = extractedData.typeOrder || Object.keys(typeLabels);
    let html = '';
    for (const key of order) {
      const count = extractedData.breakdown[key] || 0;
      if (count > 0) {
        html += `<div class="xxt-stat-item"><div class="xxt-num">${count}</div><div class="xxt-label">${typeLabels[key]}</div></div>`;
      }
    }
    els.stat.innerHTML = html;
    updateExportSelectionSummary();
  }

  // ==================== 初始化 ====================
  // 检测是否在 iframe 中运行
  let isInIframe = false;
  try { 
    isInIframe = window.top !== window.self; 
  } 
  catch(e) { isInIframe = true; }

  let initTimer = null;
  let observer = null;

  // 脚本在 document-start 注入时，document.body 还可能不存在。直接把
  // MutationObserver 挂到空 body 会抛错并中断后续初始化，统一等待 body 就绪。
  function withDocumentBody(callback) {
    if (document.body) {
      callback(document.body);
      return;
    }
    const runWhenReady = () => {
      if (document.body) callback(document.body);
      else setTimeout(runWhenReady, 0);
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', runWhenReady, { once: true });
    } else {
      setTimeout(runWhenReady, 0);
    }
  }

  if (isInIframe) {
    // 在 iframe 中：提取题目并通过 postMessage 回传给父窗口，不创建 UI
    let iframeDebounceTimer = null;
    async function iframeExtract(requestId = '') {
      await prepareFontCipherDecoder(document);
      const result = extractFromRoot(document);
      if (!hasQuestions(result)) return;
      // 获取标题（兼容作业详情页与章节测验页）
      const titleEl = document.querySelector('.mark_title, .newTestTitle, .TestTitle_name');
      const title = titleEl ? decodeFontCipherText(titleEl.textContent.trim(), titleEl) : '';
      // 题目页可能嵌套在学习页、内容卡和作业页等多层 iframe 中。
      // 消息由直属父窗口逐层转发，因此顶层面板也能收到最内层题目数据。
      const message = {
        type: 'xxt-iframe-result',
        data: { ...result, title },
        context: { href: window.location.href, title },
        requestId,
        sentAt: Date.now(),
        relayContexts: []
      };
      // 只发给直属父窗口，由每层父窗口验证 source 后继续转发。
      // 直接发给 top 会使 top 无法验证“直属 iframe”来源。
      try { window.parent.postMessage(message, '*'); } catch (e) {}
    }

    // 顶层面板手动点击“提取本页题目”时，外层 iframe 会把请求继续转发给
    // 深层题目 iframe；真正的题目页收到后立即重新解析并回传。
    window.addEventListener('message', (event) => {
      if (!event.data || event.data.type !== 'xxt-request-extract') return;
      if (event.source !== window.parent) return;
      const sentAt = Number(event.data.sentAt || 0);
      if (sentAt && Date.now() - sentAt > 30000) return;
      iframeExtract(event.data.requestId || '');
      relayIframeExtractRequest(event.data);
    });

    // 任务入口一般在外层 iframe 内，点击事件不会传到顶层 document。
    // 提前通知顶层面板清除旧结果，防止切换到另一个随堂练习时仍显示上一页。
    function notifyTopOfIframeNavigation() {
      try {
        window.parent.postMessage({
          type: 'xxt-iframe-navigation',
          context: { href: window.location.href, title: document.title || '' },
          sentAt: Date.now()
        }, '*');
      } catch (e) {}
    }
    function isIframeTaskNavigationTarget(target) {
      if (!target || !(target.closest instanceof Function)) return false;
      const entry = target.closest('#coursetree, .posCatalog_select, .posCatalog_name, .posCatalog, .task, .task-item, .work, .work-item, .job, .job-item, .chapter, .chapter-item, [class*="task"], [class*="Task"], [class*="work"], [class*="Work"], [class*="job"], [class*="Job"], [class*="chapter"], [class*="Chapter"], a[href*="quiz"], a[href*="answerQuestion"], a[href*="work"]');
      if (entry) return true;
      const link = target.closest('a, button, [role="button"]');
      const text = (link && link.textContent || '').replace(/\s+/g, ' ').trim();
      return /^(?:随堂练习|章节测验|作业|考试|任务)(?:\s|$)/.test(text);
    }
    document.addEventListener('click', (event) => {
      if (isIframeTaskNavigationTarget(event.target)) notifyTopOfIframeNavigation();
    }, true);

    // 监听题目 DOM 变化并准备回传，真正的顶层提取仍由用户点击主按钮触发。
    // 始终挂载在 document.body 上，避免题目容器被替换后 observer 失效
    let iframeQuestionObserver = null;
    function observeForQuestions() {
      if (iframeQuestionObserver) return;
      withDocumentBody(body => {
        if (iframeQuestionObserver) return;
        const mo = new MutationObserver(() => {
          if (iframeDebounceTimer) clearTimeout(iframeDebounceTimer);
          iframeDebounceTimer = setTimeout(iframeExtract, 300);
        });
        mo.observe(body, { childList: true, subtree: true });
        iframeQuestionObserver = mo;
      });
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        iframeExtract();
        observeForQuestions();
      });
    } else {
      iframeExtract();
      observeForQuestions();
    }
    // 延迟重试，应对用户点击主按钮前题目内容仍在动态加载；
    // 这些回传只缓存数据，不会自动改变顶层面板。
    setTimeout(iframeExtract, 1500);
    setTimeout(iframeExtract, 3000);
    // 定时轮询兜底，应对 SPA 页面替换时 MutationObserver 遗漏。
    setInterval(iframeExtract, 2000);
  } else {
    // 在顶层窗口中：正常创建 UI 并监听 iframe 回传数据
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', createPanel);
    } else {
      createPanel();
    }

    // 学习通切换题目页时经常只替换 iframe 内容，顶层 URL 和外层
    // DOM 都不变。监听任务点击、iframe load 及 iframe src 变化，清除
    // 上一页结果；新题目仍需用户手动点击“提取本页题目”。
    let lastFrameState = '';
    const navigationFrameListeners = new WeakSet();
    const markNavigationStarted = () => {
      // 新页面结果已经到达时，iframe 的 load 事件可能随后才触发；
      // 此时不能再次清空刚识别出的新题目。
      if (Date.now() - (window.__xxt_last_iframe_message_at || 0) < 1200) return;
      window.__xxt_navigation_started_at = Date.now();
      // 批量提取会按原生课程路径连续切换可见任务；这些 load/src 变化属于
      // 自动流程，不能清空正在累计的结果或覆盖右侧进度。
      if (batchExtractionRun && batchExtractionRun.running) return;
      if (window.__xxt_reset_extraction) window.__xxt_reset_extraction();
    };
    const inspectPracticeFrames = () => {
      const frames = Array.from(document.querySelectorAll('iframe:not([data-xxt-batch-frame])'));
      const frameState = frames.map(frame => {
        let contentHref = '';
        try { contentHref = frame.contentWindow && frame.contentWindow.location.href || ''; } catch (e) {}
        return [frame.id || '', frame.name || '', frame.getAttribute('src') || '', contentHref].join('|');
      }).join('\\n');
      if (lastFrameState && frameState !== lastFrameState) markNavigationStarted();
      lastFrameState = frameState;
      frames.forEach(frame => {
        if (navigationFrameListeners.has(frame)) return;
        navigationFrameListeners.add(frame);
        frame.addEventListener('load', () => {
          markNavigationStarted();
          setTimeout(inspectPracticeFrames, 0);
        }, true);
      });
    };
    const isPracticeNavigationTarget = (target) => {
      if (!target || !(target.closest instanceof Function)) return false;
      if (target.closest('#xxt-panel, #xxt-settings-modal')) return false;
      const related = target.closest('#coursetree, .posCatalog_select, .posCatalog_name, .posCatalog, .task, .task-item, .work, .work-item, .job, .job-item, .chapter, .chapter-item, [class*="task"], [class*="Task"], [class*="work"], [class*="Work"], [class*="job"], [class*="Job"], [class*="chapter"], [class*="Chapter"], a[href*="quiz"], a[href*="answerQuestion"], a[href*="work"]');
      return !!related;
    };
    document.addEventListener('click', (event) => {
      if (batchExtractionRun && batchExtractionRun.running) return;
      if (isPracticeNavigationTarget(event.target)) markNavigationStarted();
    }, true);
    inspectPracticeFrames();
    setInterval(inspectPracticeFrames, 800);

    withDocumentBody(body => {
      if (observer) return;
      observer = new MutationObserver(() => {
        if (initTimer) clearTimeout(initTimer);
        initTimer = setTimeout(createPanel, 500);
      });
      observer.observe(body, { childList: true, subtree: true });
    });
  }

})();
