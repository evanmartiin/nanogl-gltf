import Node from "../elements/Node"
import Mesh from "../elements/Mesh"
import Primitive from "../elements/Primitive"
import Camera from 'nanogl-camera'
import BaseMaterial from 'nanogl-pbr/BaseMaterial'
import MorphDeformer from 'nanogl-pbr/MorphDeformer'
import SkinDeformer, { SkinAttributeSet } from 'nanogl-pbr/SkinDeformer'
import { GLContext } from "nanogl/types"
import Assert from "../lib/assert"
import Program from "nanogl/program"
import Bounds from "nanogl-pbr/Bounds"
import { MorphAttributeType, MorphAttribInfos, MorphAttributeName } from "nanogl-pbr/MorphCode"
import GLState from 'nanogl-state/GLState'
import GLConfig from "nanogl-state/GLConfig"
import Gltf from "../Gltf"




function assertIsNumComps( n : number ) : asserts n is 1|2|3|4 {
  if( n<1 || n>4 ) throw new Error('number is not Component size')
}

function assertSemanticCanBeMorphed( s : string ) : asserts s is MorphAttributeName {
  if( s !== 'position' && s !== 'normal' && s !== 'tangent' ) throw new Error(`semantic ${s} can't be morphed`)
}




export default class MeshRenderer {

  
  readonly node: Node;
  readonly mesh: Mesh;

  private _skinDeformers = new Map<Primitive, SkinDeformer>();
  private _morphDeformers = new Map<Primitive, MorphDeformer>();
  
  materials : BaseMaterial[] = []
  
  glconfig? : GLConfig;

  readonly bounds : Bounds = new Bounds();


  
  constructor( gtlf : Gltf, node: Node) {
    Assert.isDefined( node.mesh );
    this.node = node;
    this.mesh = node.mesh;
    
    this.setupMaterials( gtlf );
    this.computeBounds();
  }
  
  /**
   * for each primitives, create a material based on primitive's material pass
   * if skin or morph target are present, deformers are set on the created material
   * TODO: if no deformer, a single material instance can be shared between renderers
   */
  setupMaterials(gtlf : Gltf) {
    for (const primitive of this.mesh.primitives ) {
      const material = primitive.material.createMaterialForPrimitive( gtlf, this.node, primitive );
      this.configureDeformers( material, primitive );
      this.materials.push( material );
    }

  }

  configureDeformers(material: BaseMaterial, primitive: Primitive) {
    this.configureSkin ( material, primitive );
    this.configureMorph( material, primitive );
  }

  configureMorph(material: BaseMaterial, primitive: Primitive) {

    if( primitive.targets !== null ){
      
      // console.log("CONFIGURING MORPH : ", primitive);
      const morphedAttribs = primitive.targets[0].attributes;
      const morphInfos : MorphAttribInfos[] = [];
      
      for (const morphedattrib of morphedAttribs) {
        
        const miAttributes = primitive.targets.map( (target)=>{
          return target.getSemantic( morphedattrib.semantic ).glslname
        });
        
        const aname : string = morphedattrib.semantic.toLowerCase()
        assertSemanticCanBeMorphed( aname );
        
        const morphInfo :MorphAttribInfos = {
          name : aname,
          type : morphedattrib.accessor.glslType as MorphAttributeType,
          attributes : miAttributes,
        }
        
        morphInfos.push( morphInfo );
      }
      
      const morphDeformer = new MorphDeformer( morphInfos );
      

      material.inputs.add( morphDeformer );
      this._morphDeformers.set( primitive, morphDeformer );

      this.setupMorphWeights(morphDeformer);
    }
    
  
  }
  setupMorphWeights( morph:MorphDeformer) {
    if( this.node.weights ){
      morph.weights = this.node.weights 
    } else if( this.mesh.weights ){
      morph.weights = this.mesh.weights 
    }
  }

  configureSkin(material: BaseMaterial, primitive: Primitive) {
    
    if( this.node.skin ){
      
      const numJoints = this.node.skin.joints.length;

      const attributeSet : SkinAttributeSet[] = [];
      
      let setIndex = 0
      while( true ){

        const wsem = 'WEIGHTS_'+setIndex;
        const jsem = 'JOINTS_' +setIndex;
        const weights = primitive.attributes.getSemantic( wsem );
        const joints  = primitive.attributes.getSemantic( jsem );
        
        if( (weights === null) !== (joints === null) ){
          throw new Error('Skin attributes inconsistency')
        }

        if( weights === null ) break;
        
        if( weights.accessor.numComps !== joints.accessor.numComps){
          throw new Error('weight and joints attribute dont have the same size')
        }

        const numComponents = weights.accessor.numComps;
        assertIsNumComps( numComponents );

        attributeSet.push({
          weightsAttrib : weights.glslname,
          jointsAttrib  : joints .glslname,
          numComponents
        })
        setIndex++;
      }

      const skinDeformer = new SkinDeformer(numJoints, attributeSet)
      // add skin deformer
      //material.setSkin ...
      material.inputs.add( skinDeformer );
      this._skinDeformers.set( primitive, skinDeformer );
    }
    
  }

  computeBounds() {
    this.bounds.copyFrom( this.mesh.primitives[0].bounds )
    for (const primitive of this.mesh.primitives ) {
      Bounds.union( this.bounds, this.bounds, primitive.bounds );
    }
  }

  

  render( gl:GLContext, camera:Camera, mask:number, passId : string,  glconfig?:GLConfig ) : void {

    
    const primitives = this.mesh.primitives;
    
    
    const glstate = GLState.get(gl)
    
    for (let i = 0; i < primitives.length; i++) {
      const primitive = primitives[i];

      if( this._skinDeformers.has(primitive) ){
        this.node.skin.computeJoints( this.node, this._skinDeformers.get(primitive).jointMatrices );
      }
      
      if (this._morphDeformers.has(primitive)) {
        this.setupMorphWeights( this._morphDeformers.get(primitive) );
      }

      const mat:BaseMaterial = this.materials[i];
      
      if ( !mat.hasPass( passId ) || (mat.mask & mask) === 0)  continue;
      
      const passInstance = mat.getPass( passId );
      
      if ((passInstance.pass.mask & mask) === 0) continue;

      passInstance.prepare( this.node, camera )


      // push configs
      // -------------


      glstate.push( passInstance.pass.glconfig );
      mat.glconfig  && glstate.push(mat.glconfig);
      this.glconfig && glstate.push(this.glconfig);
      glconfig      && glstate.push(glconfig);
      
      glstate.apply()
      
      // render
      // ----------
      this.drawCall(camera, passInstance.getProgram(), primitive);
      
      // pop configs
      // -------------
      
      glstate.pop();
      mat.glconfig  && glstate.pop();
      this.glconfig && glstate.pop();
      glconfig      && glstate.pop();

    }

  }


  drawCall( camera:Camera, prg:Program, sub:Primitive ) {
    sub.bindVao( prg );
    sub.render();
    sub.unbindVao();
  }


}