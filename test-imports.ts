
console.log('Testing utils imports...');

try {
  console.log('\n1. Importing check...');
  const checkImport = await import('./src/utils/check.js');
  console.log('   check imported successfully:', typeof checkImport, Object.keys(checkImport));
  if (checkImport.check) {
    console.log('   check is exported!');
  }
} catch (e) {
  console.error('   ❌ Error importing check:', e);
}

try {
  console.log('\n2. Importing status...');
  const statusImport = await import('./src/utils/status.js');
  console.log('   status imported successfully:', typeof statusImport, Object.keys(statusImport));
  if (statusImport.status) {
    console.log('   status is exported!');
  }
} catch (e) {
  console.error('   ❌ Error importing status:', e);
}

try {
  console.log('\n3. Importing moduleCmd...');
  const moduleImport = await import('./src/utils/module.js');
  console.log('   module imported successfully:', typeof moduleImport, Object.keys(moduleImport));
  if (moduleImport.moduleCmd) {
    console.log('   moduleCmd is exported!');
  }
} catch (e) {
  console.error('   ❌ Error importing moduleCmd:', e);
}

try {
  console.log('\n4. Importing validate...');
  const validateImport = await import('./src/utils/validate.js');
  console.log('   validate imported successfully:', typeof validateImport, Object.keys(validateImport));
  if (validateImport.validate) {
    console.log('   validate is exported!');
  }
} catch (e) {
  console.error('   ❌ Error importing validate:', e);
}

try {
  console.log('\n5. Importing test...');
  const testImport = await import('./src/utils/test.js');
  console.log('   test imported successfully:', typeof testImport, Object.keys(testImport));
  if (testImport.test) {
    console.log('   test is exported!');
  }
} catch (e) {
  console.error('   ❌ Error importing test:', e);
}

try {
  console.log('\n6. Importing build...');
  const buildImport = await import('./src/utils/build.js');
  console.log('   build imported successfully:', typeof buildImport, Object.keys(buildImport));
  if (buildImport.build) {
    console.log('   build is exported!');
  }
} catch (e) {
  console.error('   ❌ Error importing build:', e);
}

console.log('\n✅ Done!');

