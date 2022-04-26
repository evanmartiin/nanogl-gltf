
import expect from 'expect.js'

export function expectEqualArray( v, expected ){
  expect( v.constructor ).to.equal( expected.constructor )
  expect( v.length ).to.equal( expected.length )
  for (let i = 0; i < v.length; i++) {
    if( Math.abs( v[i]-expected[i] ) > 0.000001 )
      expect().fail(`array not equal : ${v[i]} expected : ${expected[i]} `)
  }
}


interface Scope{
  title : string
  data : any
}
/*
scopes
*/
export function describeMulti( dFunc, scopes : Scope[], func ){

  for( const scope of scopes ){

    dFunc( scope.title, ()=>{
      func( scope.data )
    })
  }
}