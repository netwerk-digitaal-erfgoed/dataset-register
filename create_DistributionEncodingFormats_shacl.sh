#!/bin/bash

outputShacl="./DistributionEncodingFormats.shacl"

dateUpdated=`date +%F`

echo "reg:DistributionEncodingFormatsProperty a sh:PropertyShape ;" > $outputShacl
echo "  rdfs:comment \"List of formats constructed (last updated: ${dateUpdated}) with create_DistributionEncodingFormats_shacl.sh\" ;" >> $outputShacl
echo -n "  sh:in(" >> $outputShacl

for registry in application audio image message model multipart text video 
do
	sourceUrl="https://www.iana.org/assignments/media-types/${registry}.csv"
	echo "Getting $sourceUrl"
	curl -s $sourceUrl | tail -n +2 | while IFS=, read -r field1 field2 field3 
		do
		if [ -n "$field2" ]
		then
			echo -n '"'$field2'" ' >> $outputShacl 
		fi
	done 
done

echo "); # from $sourceUrl" >> $outputShacl
echo "  sh:path schema:encodingFormat ; " >> $outputShacl
echo "  sh:severity sh:Warning ; ">> $outputShacl
echo "  sh:message \"Gebruik een waarde uit de IANA Media Types lijst (https://www.iana.org/assignments/media-types/media-types.xhtml).\"@nl, \"Use a value from the IANA Media Types list (https://www.iana.org/assignments/media-types/media-types.xhtml)\"@en ; " >> $outputShacl
echo "." >> $outputShacl

echo "Generated $outputShacl, put the contents of this file in shacl/register.ttl (as a replacement of reg:DistributionEncodingFormatsProperty)"