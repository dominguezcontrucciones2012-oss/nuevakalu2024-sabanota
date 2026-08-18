const fs = require('fs');

// CheesePOSView
let pos = fs.readFileSync('src/components/CheesePOSView.tsx', 'utf8');
pos = pos.replace(/import \{ CheeseProduct(.*)\} from '\.\.\/types';/, "import { CheeseProduct$1} from '../types';\nimport { getUnitLabel } from '../utils';");
pos = pos.replace(/p\.unit \|\| 'Kg'/g, 'getUnitLabel(p)');
pos = pos.replace(/product\.unit \|\| 'Kg'/g, 'getUnitLabel(product)');
pos = pos.replace(/item\.unit \|\| 'Kg'/g, 'getUnitLabel(item)');
pos = pos.replace(/it\.unit \|\| 'Kg'/g, 'getUnitLabel(it)');
pos = pos.replace(/p\.unit \|\| "Kg"/g, 'getUnitLabel(p)');
pos = pos.replace(/product\.unit \|\| "Kg"/g, 'getUnitLabel(product)');
pos = pos.replace(/item\.unit \|\| "Kg"/g, 'getUnitLabel(item)');
pos = pos.replace(/it\.unit \|\| "Kg"/g, 'getUnitLabel(it)');
fs.writeFileSync('src/components/CheesePOSView.tsx', pos);

// CheeseInventoryView
let inv = fs.readFileSync('src/components/CheeseInventoryView.tsx', 'utf8');
inv = inv.replace(/p\.unit \|\| 'Kg'/g, 'getUnitLabel(p)');
inv = inv.replace(/b\.unit \|\| 'Kg'/g, 'getUnitLabel(b)');
inv = inv.replace(/p\.unit \|\| "Kg"/g, 'getUnitLabel(p)');
inv = inv.replace(/b\.unit \|\| "Kg"/g, 'getUnitLabel(b)');
fs.writeFileSync('src/components/CheeseInventoryView.tsx', inv);
